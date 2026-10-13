# coding=utf-8
"""Vectorac 人脸匹配服务（ONNX Runtime CPU 版）

引擎（全部走 ONNX Runtime，不依赖 TensorFlow / PyTorch）：
  - 人脸检测：SCRFD-500M            models/det_500m.onnx
  - 特征提取：ArcFace MobileFaceNet models/w600k_mbf.onnx  （512 维）
  - 静默活体：MiniFASNetV2          models/minifasnet_v2.onnx

接口（对应 nginx location /face_compare，监听 127.0.0.1:5000）：
  GET  /                      演示页
  POST /upload                上传图片（表单字段 file），返回文件名
  GET  /image?name=           取图片 base64（演示页回显）
  GET  /compare?img1=&img2=   1:1 比对：相似度 / 判定 / 活体 / 人脸框
  GET  /healthz               健康检查

可调参数（环境变量）：
  FACE_SIM_THRESHOLD   1:1 判定阈值（余弦相似度），默认 0.35
  FACE_DET_THRESHOLD   人脸检测置信度阈值，默认 0.50
  FACE_LIVE_THRESHOLD  活体判定阈值，默认 0.50
  FACE_LIVE_CLASS      活体模型 live 类别下标，默认 1
  FACE_MIN_SIZE        最小人脸边长（像素），默认 40
  FACE_MAX_UPLOAD_MB   上传大小上限，默认 8

阈值取值依据（实测）：同一人余弦相似度 0.43~0.79，不同人 0.01~0.20，
取 0.35 两侧都留足余量。活体：真人照片 0.74~1.00，伪造样本 0.0004~0.02。
"""

import os
import time
import logging

import numpy as np
import cv2
import onnxruntime as ort
import flask

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")
IMAGE_DIR = os.path.join(BASE_DIR, "images")

DET_MODEL = os.path.join(MODEL_DIR, "det_500m.onnx")
REC_MODEL = os.path.join(MODEL_DIR, "w600k_mbf.onnx")
FAS_MODEL = os.path.join(MODEL_DIR, "minifasnet_v2.onnx")

# ---------- 可调参数 ----------
SIM_THRESHOLD = float(os.environ.get("FACE_SIM_THRESHOLD", "0.35"))
DET_THRESHOLD = float(os.environ.get("FACE_DET_THRESHOLD", "0.50"))
LIVE_THRESHOLD = float(os.environ.get("FACE_LIVE_THRESHOLD", "0.50"))
LIVE_CLASS = int(os.environ.get("FACE_LIVE_CLASS", "1"))
MIN_FACE_SIZE = int(os.environ.get("FACE_MIN_SIZE", "40"))
MAX_UPLOAD_MB = int(os.environ.get("FACE_MAX_UPLOAD_MB", "8"))

# ---------- 常量 ----------
DET_SIZE = (640, 640)
DET_STRIDES = (8, 16, 32)
DET_NUM_ANCHORS = 2
NMS_THRESHOLD = 0.4
FAS_SCALE = 2.7          # 活体模型对应的裁剪倍数（2.7_80x80）
FAS_SIZE = (80, 80)

# 旋转量 -> 顺时针角度（返回给前端）
_ROT_DEG = {None: 0, cv2.ROTATE_90_CLOCKWISE: 90,
            cv2.ROTATE_90_COUNTERCLOCKWISE: 270, cv2.ROTATE_180: 180}

# ArcFace 112x112 标准 5 点模板
ARC_TEMPLATE = np.array([
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
], dtype=np.float32)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("face")


def _new_session(path):
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 2
    opts.inter_op_num_threads = 1
    opts.log_severity_level = 3
    return ort.InferenceSession(path, opts, providers=["CPUExecutionProvider"])


def distance2bbox(points, distance):
    """中心点 + 距离 -> [x1, y1, x2, y2]"""
    x1 = points[:, 0] - distance[:, 0]
    y1 = points[:, 1] - distance[:, 1]
    x2 = points[:, 0] + distance[:, 2]
    y2 = points[:, 1] + distance[:, 3]
    return np.stack([x1, y1, x2, y2], axis=-1)


def distance2kps(points, distance):
    """中心点 + 距离 -> 5 个关键点 [x, y] * 5"""
    preds = []
    for i in range(0, distance.shape[1], 2):
        px = points[:, i % 2] + distance[:, i]
        py = points[:, i % 2 + 1] + distance[:, i + 1]
        preds.append(px)
        preds.append(py)
    return np.stack(preds, axis=-1)


def nms(dets, scores, thresh):
    x1, y1, x2, y2 = dets[:, 0], dets[:, 1], dets[:, 2], dets[:, 3]
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1 + 1)
        h = np.maximum(0.0, yy2 - yy1 + 1)
        inter = w * h
        ovr = inter / (areas[i] + areas[order[1:]] - inter)
        inds = np.where(ovr <= thresh)[0]
        order = order[inds + 1]
    return keep


def read_image(path):
    """用 imdecode 读图，避免中文/特殊字符路径问题"""
    data = np.fromfile(path, dtype=np.uint8)
    if data.size == 0:
        return None
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def _lm_valid(kps):
    """5 点几何自洽性检查：鼻尖应在双眼连线下方，嘴应在鼻尖下方。
    横躺/倒置的照片 SCRFD 仍能检出人脸，但关键点会错乱（鼻尖跑到眼睛上方），
    对齐结果随之失效（同人相似度会从 0.78 掉到 0.06），用这个判据把这种情况识别出来。"""
    e1, e2, nose, m1, m2 = kps
    return nose[1] > (e1[1] + e2[1]) / 2.0 and (m1[1] + m2[1]) / 2.0 > nose[1]


def _rot_back(x, y, rot, h, w):
    """旋转后坐标 -> 原图坐标（h/w 为原图的高、宽）"""
    if rot == cv2.ROTATE_90_CLOCKWISE:
        return y, h - 1 - x
    if rot == cv2.ROTATE_90_COUNTERCLOCKWISE:
        return w - 1 - y, x
    if rot == cv2.ROTATE_180:
        return w - 1 - x, h - 1 - y
    return x, y


class FaceEngine(object):
    def __init__(self):
        t0 = time.time()
        self.det = _new_session(DET_MODEL)
        self.rec = _new_session(REC_MODEL)
        self.fas = _new_session(FAS_MODEL)
        self.det_in = self.det.get_inputs()[0].name
        self.det_outs = [o.name for o in self.det.get_outputs()]
        self.rec_in = self.rec.get_inputs()[0].name
        self.rec_out = self.rec.get_outputs()[0].name
        self.fas_in = self.fas.get_inputs()[0].name
        self.fas_out = self.fas.get_outputs()[0].name
        log.info("模型加载完成，耗时 %.2fs", time.time() - t0)

    # ---------- 检测 ----------
    def detect(self, img):
        """返回 [{box:[x1,y1,x2,y2], score:float, kps:[[x,y]*5]}, ...]（原图坐标，按置信度降序）"""
        h, w = img.shape[:2]
        im_ratio = float(h) / float(w)
        model_ratio = float(DET_SIZE[1]) / float(DET_SIZE[0])
        if im_ratio > model_ratio:
            new_h = DET_SIZE[1]
            new_w = int(new_h / im_ratio)
        else:
            new_w = DET_SIZE[0]
            new_h = int(new_w * im_ratio)
        det_scale = float(new_h) / float(h)

        resized = cv2.resize(img, (new_w, new_h))
        canvas = np.zeros((DET_SIZE[1], DET_SIZE[0], 3), dtype=np.uint8)
        canvas[:new_h, :new_w, :] = resized

        blob = cv2.dnn.blobFromImage(canvas, 1.0 / 128, DET_SIZE,
                                     (127.5, 127.5, 127.5), swapRB=True)
        outs = self.det.run(self.det_outs, {self.det_in: blob})

        fmc = len(DET_STRIDES)
        scores_list, bboxes_list, kpss_list = [], [], []
        for idx, stride in enumerate(DET_STRIDES):
            scores = outs[idx]
            bbox_preds = outs[idx + fmc] * stride
            kps_preds = outs[idx + fmc * 2] * stride
            height = DET_SIZE[1] // stride
            width = DET_SIZE[0] // stride
            centers = np.stack(np.mgrid[:height, :width][::-1], axis=-1).astype(np.float32)
            centers = (centers * stride).reshape((-1, 2))
            if DET_NUM_ANCHORS > 1:
                centers = np.stack([centers] * DET_NUM_ANCHORS, axis=1).reshape((-1, 2))
            pos = np.where(scores[:, 0] >= DET_THRESHOLD)[0]
            if pos.size == 0:
                continue
            scores_list.append(scores[pos, 0])
            bboxes_list.append(distance2bbox(centers, bbox_preds)[pos])
            kpss_list.append(distance2kps(centers, kps_preds)[pos])

        if not scores_list:
            return []

        scores = np.concatenate(scores_list, axis=0)
        bboxes = np.concatenate(bboxes_list, axis=0) / det_scale
        kpss = np.concatenate(kpss_list, axis=0) / det_scale

        order = scores.argsort()[::-1]
        bboxes, scores, kpss = bboxes[order], scores[order], kpss[order]
        keep = nms(bboxes, scores, NMS_THRESHOLD)

        results = []
        for i in keep:
            x1, y1, x2, y2 = bboxes[i]
            x1 = float(max(0.0, min(x1, w - 1.0)))
            y1 = float(max(0.0, min(y1, h - 1.0)))
            x2 = float(max(0.0, min(x2, w - 1.0)))
            y2 = float(max(0.0, min(y2, h - 1.0)))
            if (x2 - x1) < MIN_FACE_SIZE or (y2 - y1) < MIN_FACE_SIZE:
                continue
            results.append({
                "box": [x1, y1, x2, y2],
                "score": float(scores[i]),
                "kps": kpss[i].reshape(5, 2).tolist(),
            })
        return results

    @staticmethod
    def pick_largest(faces):
        return max(faces, key=lambda f: (f["box"][2] - f["box"][0]) * (f["box"][3] - f["box"][1]))

    # ---------- 摆正 ----------
    def normalize(self, img):
        """把图摆正，返回 (img_used, rot, faces)。

        绝大多数照片第一次（0°）就通过，零额外开销；只有横躺/倒置的照片才会多跑
        几次检测。faces 是 img_used 坐标系下的人脸，后续对齐/活体都用 img_used。"""
        faces = self.detect(img)
        if faces and _lm_valid(self.pick_largest(faces)["kps"]):
            return img, None, faces
        for rot in (cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_90_COUNTERCLOCKWISE, cv2.ROTATE_180):
            rimg = cv2.rotate(img, rot)
            rfaces = self.detect(rimg)
            if rfaces and _lm_valid(self.pick_largest(rfaces)["kps"]):
                log.info("人脸方向修正：顺时针旋转 %d°",
                         {cv2.ROTATE_90_CLOCKWISE: 90,
                          cv2.ROTATE_90_COUNTERCLOCKWISE: 270,
                          cv2.ROTATE_180: 180}[rot])
                return rimg, rot, rfaces
        return img, None, faces

    @staticmethod
    def to_original(box, rot, shape):
        """把摆正图坐标系下的人脸框换算回原图坐标（前端在原图上画框用）"""
        if rot is None:
            return [float(v) for v in box]
        h, w = shape[:2]
        x1, y1 = _rot_back(box[0], box[1], rot, h, w)
        x2, y2 = _rot_back(box[2], box[3], rot, h, w)
        return [float(min(x1, x2)), float(min(y1, y2)),
                float(max(x1, x2)), float(max(y1, y2))]

    # ---------- 对齐 ----------
    @staticmethod
    def align(img, kps):
        src = np.array(kps, dtype=np.float32).reshape(5, 2)
        m, _ = cv2.estimateAffinePartial2D(src, ARC_TEMPLATE, method=cv2.LMEDS)
        if m is None:
            m, _ = cv2.estimateAffinePartial2D(src, ARC_TEMPLATE, method=0)
        if m is None:
            return None
        return cv2.warpAffine(img, m, (112, 112), borderValue=0.0)

    # ---------- 特征 ----------
    def embed(self, aligned):
        blob = cv2.dnn.blobFromImage(aligned, 1.0 / 127.5, (112, 112),
                                     (127.5, 127.5, 127.5), swapRB=True)
        feat = self.rec.run([self.rec_out], {self.rec_in: blob})[0][0]
        norm = float(np.linalg.norm(feat))
        if norm > 0:
            feat = feat / norm
        return feat

    # ---------- 活体 ----------
    def liveness(self, img, box):
        h, w = img.shape[:2]
        x1, y1, x2, y2 = box
        cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
        bw, bh = (x2 - x1) * FAS_SCALE, (y2 - y1) * FAS_SCALE
        nx1 = int(max(0, cx - bw / 2))
        ny1 = int(max(0, cy - bh / 2))
        nx2 = int(min(w, cx + bw / 2))
        ny2 = int(min(h, cy + bh / 2))
        crop = img[ny1:ny2, nx1:nx2]
        if crop.size == 0:
            return {"is_live": False, "score": 0.0, "classes": []}

        crop = cv2.resize(crop, FAS_SIZE)
        # 注意：官方 ToTensor 把 /255 注释掉了（见 src/data_io/functional.py），
        # 模型期望的是 0~255 原始像素、BGR、HWC->CHW，不能归一化。
        blob = crop.astype(np.float32)
        blob = np.transpose(blob, (2, 0, 1))[None, ...]
        out = self.fas.run([self.fas_out], {self.fas_in: blob})[0][0]

        # 模型输出是 logits（不含 softmax），这里自行 softmax
        exp = np.exp(out - out.max())
        prob = exp / exp.sum()
        live = float(prob[LIVE_CLASS])
        return {
            "is_live": bool(live >= LIVE_THRESHOLD),
            "score": round(live, 4),
            "classes": [round(float(v), 4) for v in prob],
        }


_engine = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = FaceEngine()
    return _engine


app = flask.Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "x-requested-with,content-type"
    return resp


@app.route("/")
def api_index():
    return flask.render_template("index.html")


@app.route("/healthz")
def api_healthz():
    return flask.jsonify({"code": 200, "status": "ok"})


@app.route("/upload", methods=["POST"])
def api_upload():
    if "file" not in flask.request.files:
        return flask.jsonify({"code": 400, "msg": "no file"})
    f = flask.request.files["file"]
    name = os.path.basename(f.filename or "")
    if not name:
        return flask.jsonify({"code": 400, "msg": "empty filename"})
    if os.path.splitext(name)[1].lower() not in ALLOWED_EXT:
        return flask.jsonify({"code": 400, "msg": "unsupported file type"})
    if not os.path.exists(IMAGE_DIR):
        os.makedirs(IMAGE_DIR)
    f.save(os.path.join(IMAGE_DIR, name))
    return flask.jsonify({"code": 200, "msg": "success", "name": name})


@app.route("/image")
def api_image():
    name = flask.request.args.get("name", "")
    path = os.path.join(IMAGE_DIR, os.path.basename(name))
    if not name or not os.path.exists(path):
        return flask.jsonify({"code": 400, "msg": "image not found"})
    with open(path, "rb") as fp:
        data = base64_encode(fp.read())
    return flask.jsonify({"code": 200, "msg": "success", "data": data})


def base64_encode(raw):
    import base64
    return base64.b64encode(raw).decode("utf-8")


def _load(name):
    """按文件名读图，返回 (img, error_dict)"""
    path = os.path.join(IMAGE_DIR, os.path.basename(name or ""))
    if not name or not os.path.exists(path):
        return None, {"code": 400, "msg": "file not exist", "which": name}
    img = read_image(path)
    if img is None:
        return None, {"code": 400, "msg": "cannot decode image", "which": name}
    return img, None


@app.route("/compare")
def api_compare():
    name1 = flask.request.args.get("img1", "")
    name2 = flask.request.args.get("img2", "")
    if not name1 or not name2:
        return flask.jsonify({"code": 400, "msg": "No image!!"})

    img1, err1 = _load(name1)
    if err1:
        return flask.jsonify(err1)
    img2, err2 = _load(name2)
    if err2:
        return flask.jsonify(err2)

    engine = get_engine()
    t0 = time.time()

    img1u, rot1, faces1 = engine.normalize(img1)
    if not faces1:
        return flask.jsonify({"code": 400, "msg": "face not detected", "which": "img1"})
    img2u, rot2, faces2 = engine.normalize(img2)
    if not faces2:
        return flask.jsonify({"code": 400, "msg": "face not detected", "which": "img2"})

    f1 = FaceEngine.pick_largest(faces1)
    f2 = FaceEngine.pick_largest(faces2)

    aligned1 = FaceEngine.align(img1u, f1["kps"])
    aligned2 = FaceEngine.align(img2u, f2["kps"])
    if aligned1 is None or aligned2 is None:
        return flask.jsonify({"code": 400, "msg": "face align failed"})

    feat1 = engine.embed(aligned1)
    feat2 = engine.embed(aligned2)
    similarity = float(np.dot(feat1, feat2))

    live1 = engine.liveness(img1u, f1["box"])
    live2 = engine.liveness(img2u, f2["box"])

    elapsed = int((time.time() - t0) * 1000)
    log.info("compare %s vs %s -> sim=%.4f same=%s (%dms)",
             name1, name2, similarity, similarity >= SIM_THRESHOLD, elapsed)

    return flask.jsonify({
        "code": 200,
        "similarity": round(similarity, 4),
        "score": round(max(0.0, min(1.0, similarity)) * 100, 1),
        "is_same": bool(similarity >= SIM_THRESHOLD),
        "threshold": SIM_THRESHOLD,
        "liveness": {"img1": live1, "img2": live2},
        "faces": {
            "img1": {"box": FaceEngine.to_original(f1["box"], rot1, img1.shape),
                     "score": round(f1["score"], 4), "count": len(faces1),
                     "rotate": _ROT_DEG[rot1]},
            "img2": {"box": FaceEngine.to_original(f2["box"], rot2, img2.shape),
                     "score": round(f2["score"], 4), "count": len(faces2),
                     "rotate": _ROT_DEG[rot2]},
        },
        "elapsed_ms": elapsed,
    })


if __name__ == "__main__":
    get_engine()  # 启动即加载模型，避免首个请求超时
    app.run(host="127.0.0.1", port=5000, threaded=True)
