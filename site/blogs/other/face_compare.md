::: warning 人脸匹配
两张人脸进行 1:1 比对，返回相似度评分；同时内置静默活体检测，识别打印照片与屏幕翻拍，确保比对结果真实可靠。
:::

<div class="face-hero">
  <div class="face-hero-inner">
    <div class="face-hero-text">
      <h1>人脸 1:1 比对 · 静默活体检测</h1>
      <p>上传两张照片即可得到相似度评分与真人判定，无需用户眨眼、转头等动作配合。普通 CPU 服务器即可运行，常驻内存仅约 80MB。</p>
      <div class="face-hero-cta">
        <a href="#demo" class="face-btn face-btn-primary">在线体验</a>
      </div>
    </div>
  </div>
</div>

## 四大能力

<div class="face-grid">
  <div class="face-card">
    <div class="face-card-icon">🧑‍🤝‍🧑</div>
    <div class="face-card-title">人脸 1:1 比对</div>
    <div class="face-card-desc">提取 512 维人脸特征，余弦相似度打分，判断两张照片是否为同一个人。</div>
    <div class="face-card-tags"><span>身份核验</span><span>重复注册检测</span></div>
  </div>
  <div class="face-card">
    <div class="face-card-icon">🛡️</div>
    <div class="face-card-title">静默活体检测</div>
    <div class="face-card-desc">单张图片即可判别真人 / 打印照片 / 屏幕翻拍，用户全程无感知。</div>
    <div class="face-card-tags"><span>防翻拍</span><span>无感体验</span></div>
  </div>
  <div class="face-card">
    <div class="face-card-icon">🔄</div>
    <div class="face-card-title">自动摆正</div>
    <div class="face-card-desc">横躺、倒置的照片自动检测并转正，手机随手拍也能稳定对齐比对。</div>
    <div class="face-card-tags"><span>多姿态</span><span>随手拍</span></div>
  </div>
  <div class="face-card">
    <div class="face-card-icon">⚡</div>
    <div class="face-card-title">轻量可私有化</div>
    <div class="face-card-desc">模型总计约 17MB，纯 CPU 推理，单次比对百毫秒级，可完全离线部署。</div>
    <div class="face-card-tags"><span>无需 GPU</span><span>内网离线</span></div>
  </div>
</div>

## 实测效果

<div class="face-proof">
  <div class="face-proof-card">
    <div class="face-proof-head">
      <span>人脸相似度</span>
      <b>78.7<small>%</small></b>
    </div>
    <div class="face-proof-bar"><i></i></div>
    <div class="face-proof-badges">
      <span class="face-badge ok">判定为同一人</span>
      <span class="face-badge mute">阈值 35%</span>
      <span class="face-badge mute">耗时 86 ms</span>
    </div>
    <div class="face-proof-live">
      <div><i class="face-dot ok"></i>照片 A 活体：真人（99.9%）</div>
      <div><i class="face-dot ok"></i>照片 B 活体：真人（97.3%）</div>
    </div>
  </div>
  <div class="face-proof-data">
    <div class="face-proof-cap">实测分数区间</div>
    <div class="face-data-row"><span>同一人</span><b>0.43 ~ 0.79</b></div>
    <div class="face-data-row"><span>不同人</span><b>0.01 ~ 0.20</b></div>
    <div class="face-data-row"><span>真人照片活体分</span><b>0.74 ~ 1.00</b></div>
    <div class="face-data-row"><span>打印 / 翻拍样本</span><b>0.0004 ~ 0.02</b></div>
    <div class="face-data-row"><span>单次比对耗时</span><b>50 ~ 110 ms</b></div>
    <div class="face-data-row"><span>服务常驻内存</span><b>约 80 MB</b></div>
    <div class="face-proof-note">判定阈值取 0.35，同人与不同人两侧均留有充足余量。</div>
  </div>
</div>

## 核心指标

| 维度 | 说明 |
| --- | --- |
| 比对方式 | 1:1 人脸比对，返回余弦相似度评分 |
| 人脸特征 | 512 维，人脸检测后按标准 5 点对齐再提特征 |
| 活体检测 | 静默式，单张图片判别真人 / 翻拍，无需动作配合 |
| 图片要求 | 生活照、证件照、身份证芯片照均可，建议人脸边长 ≥ 40px |
| 比对速度 | 单次约 50~110 ms（CPU），含检测 + 对齐 + 活体 |
| 资源占用 | 模型约 17MB，服务常驻内存约 80MB，无需 GPU |
| 接入方式 | 在线 HTTP API（任意语言）/ 私有化部署包 |
| 数据安全 | 私有化部署可完全离线运行，数据不出内网 |
| 适用环境 | 普通 CPU 服务器，2 核 2G 即可稳定运行 |

## 接入方式

<div class="face-access">
  <div class="face-access-col">
    <div class="face-access-title">在线 API</div>
    <p>上传两张图片，一次调用即返回相似度、判定结果与活体分数：</p>

```bash
# 1. 上传两张图片
curl -X POST https://vectorac.com/face_compare/upload \
  -F "file=@/path/to/a.jpg"
# → {"code":200,"name":"a.jpg"}

curl -X POST https://vectorac.com/face_compare/upload \
  -F "file=@/path/to/b.jpg"
# → {"code":200,"name":"b.jpg"}

# 2. 1:1 比对
curl "https://vectorac.com/face_compare/compare?img1=a.jpg&img2=b.jpg"
# → {"code":200,"score":78.7,"is_same":true,
#    "liveness":{"img1":{"is_live":true,"score":0.999}, ...}}
```

  </div>
  <div class="face-access-col">
    <div class="face-access-title">私有化部署</div>
    <p>提供软件部署包，可在本地服务器运行，适用于安全级别较高的内网环境：</p>
    <ul>
      <li>完全离线，人脸数据不出企业内网</li>
      <li>普通 CPU 服务器即可，无需 GPU</li>
      <li>模型总计约 17MB，常驻内存约 80MB</li>
      <li>提供部署文档与技术对接支持</li>
    </ul>
  </div>
</div>

<div id="demo"></div>

## 在线体验

上传两张照片，立即体验比对与活体检测效果（比对在浏览器与服务器间完成，图片不会被保存）：

 <iframe  
 id="faceDemoFrame"
 class="face-demo-iframe"
 width=100% 
 src="https://vectorac.com/face_compare/"  
 frameborder=0  
 scrolling="auto"
 allowfullscreen style="background-color:#0d1117;border-radius:12px;">
 </iframe>

## 联系我们

<div class="face-contact">
  <p>需要 <b>API 接入文档</b>、<b>私有化部署方案</b>，或有任何合作意向？欢迎联系我们，我们会在 1 个工作日内回复。</p>
  <a href="mailto:support@vectorac.com" class="face-btn face-btn-primary">📧 support@vectorac.com</a>
</div>

<style>
/* Hero */
.face-hero {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  margin: 18px 0 8px;
  background: #0b1a2b url('/img/face/hero.png') right center / cover no-repeat;
}
.face-hero::before {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(90deg, rgba(8,18,36,.94) 0%, rgba(8,18,36,.74) 45%, rgba(8,18,36,.30) 100%);
}
.face-hero-inner { position: relative; padding: 54px 40px; max-width: 620px; }
.face-hero-text h1 { display: block; color: #fff; font-size: 32px; font-weight: 800; margin: 0 0 14px; letter-spacing: 1px; }
.face-hero-text p { color: #bdd3c8; font-size: 15px; line-height: 1.7; margin: 0 0 24px; }
.face-hero-cta { display: flex; gap: 14px; flex-wrap: wrap; }

.face-btn {
  display: inline-block; padding: 11px 26px; border-radius: 24px; font-size: 15px; font-weight: 600;
  text-decoration: none; transition: all .2s; cursor: pointer;
}
.face-btn-primary {
  background: linear-gradient(135deg, #46c98d, #2f9e6e); color: #fff !important;
  box-shadow: 0 4px 14px rgba(62,175,124,.4);
}
.face-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(62,175,124,.5); }

/* 能力网格 */
.face-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 12px 0; }
.face-card {
  background: #fff; border: 1px solid #eef0f5; border-radius: 14px; padding: 20px 18px;
  box-shadow: 0 3px 12px rgba(40,60,120,.05); transition: all .2s;
}
.face-card:hover { transform: translateY(-3px); box-shadow: 0 8px 22px rgba(40,60,120,.1); }
.face-card-icon { font-size: 30px; margin-bottom: 10px; }
.face-card-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; color: #2c3e50; }
.face-card-desc { font-size: 12.5px; line-height: 1.65; color: #8492a6; margin-bottom: 12px; min-height: 60px; }
.face-card-tags span {
  display: inline-block; font-size: 11px; color: #2f9e6e; background: #e9f8f1;
  padding: 3px 9px; border-radius: 11px; margin: 0 5px 5px 0;
}

/* 实测效果 */
.face-proof {
  display: flex; gap: 22px; align-items: stretch; background: #fff;
  border: 1px solid #eef0f5; border-radius: 14px; padding: 22px; box-shadow: 0 3px 12px rgba(40,60,120,.05);
}
.face-proof-card {
  flex: 0 0 46%; min-width: 0; border-radius: 12px; padding: 20px;
  background: #0d1117; border: 1px solid #262e3a; color: #e6edf3;
}
.face-proof-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
.face-proof-head span { font-size: 13px; color: #8b949e; }
.face-proof-head b { font-size: 36px; font-weight: 600; line-height: 1; color: #3eaf7c; }
.face-proof-head b small { font-size: 17px; font-weight: 500; margin-left: 2px; }
.face-proof-bar { height: 9px; border-radius: 5px; background: #21262d; overflow: hidden; margin-bottom: 16px; }
.face-proof-bar > i { display: block; height: 100%; width: 78.7%; border-radius: 5px; background: linear-gradient(90deg, #3eaf7c, #4aa3e8); }
.face-proof-badges { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 14px; border-top: 1px solid #262e3a; }
.face-badge { display: inline-block; padding: 4px 11px; border-radius: 20px; font-size: 12.5px; font-weight: 500; }
.face-badge.ok { color: #3eaf7c; background: rgba(62,175,124,.12); border: 1px solid rgba(62,175,124,.35); }
.face-badge.mute { color: #8b949e; background: rgba(139,148,158,.1); border: 1px solid #262e3a; }
.face-proof-live { margin-top: 14px; padding-top: 14px; border-top: 1px solid #262e3a; }
.face-proof-live div { font-size: 12.5px; color: #8b949e; margin-bottom: 7px; }
.face-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #3eaf7c; margin-right: 7px; }

.face-proof-data { flex: 1; min-width: 0; }
.face-proof-cap { font-size: 12px; color: #a5b1c5; margin: 0 0 10px; }
.face-data-row {
  display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
  font-size: 13.5px; padding: 9px 12px; border-radius: 8px; background: #f6f8fc; margin-bottom: 8px; color: #5a6b85;
}
.face-data-row b { color: #2c3e50; font-weight: 600; white-space: nowrap; }
.face-proof-note { font-size: 12px; color: #8492a6; margin-top: 10px; }

/* 接入方式 */
.face-access { display: flex; gap: 22px; }
.face-access-col {
  flex: 1; min-width: 0; background: #fff; border: 1px solid #eef0f5;
  border-radius: 14px; padding: 20px 22px; box-shadow: 0 3px 12px rgba(40,60,120,.05);
}
.face-access-col .face-access-title { font-size: 16px; font-weight: 700; margin-bottom: 10px; color: #2c3e50; }
.face-access-col p { font-size: 13px; color: #8492a6; line-height: 1.7; }
.face-access-col ul { font-size: 13px; color: #5a6b85; line-height: 1.9; padding-left: 18px; margin: 8px 0 0; }

/* 联系 */
.face-contact {
  text-align: center; background: linear-gradient(135deg, #0b1a2b, #16324a);
  border-radius: 16px; padding: 34px 24px; margin-top: 10px;
}
.face-contact p { color: #bdd3c8; font-size: 14.5px; line-height: 1.7; margin: 0 0 18px; }

/* 演示 iframe：可滚动，固定高度（桌面 820 / 移动 900） */
.face-demo-iframe { height: 820px; }

/* 响应式 */
@media (max-width: 960px) {
  .face-grid { grid-template-columns: repeat(2, 1fr); }
  .face-hero-inner { padding: 40px 26px; }
  .face-proof { flex-direction: column; }
  .face-proof-card { flex: 0 0 auto; }
}
@media (max-width: 640px) {
  /* Hero：移动端用纯渐变，隐藏复杂背景图，文字按钮清爽 */
  .face-hero { background: linear-gradient(135deg, #0b1a2b 0%, #16324a 60%, #1d4a63 100%); }
  .face-hero::before { display: none; }
  .face-hero-inner { padding: 30px 20px; max-width: 100%; text-align: center; }
  .face-hero-text h1 { font-size: 22px; margin-bottom: 10px; }
  .face-hero-text p { font-size: 13px; line-height: 1.6; margin-bottom: 18px; }
  .face-hero-cta { display: flex; justify-content: center; gap: 10px; }
  .face-hero-cta .face-btn { padding: 11px 40px; font-size: 14px; text-align: center; }

  .face-grid { grid-template-columns: 1fr; gap: 12px; }
  .face-card-desc { min-height: 0; }
  .face-proof { padding: 16px; }
  .face-access { flex-direction: column; gap: 14px; }
  .face-demo-iframe { height: 900px; }
}

/* 暗夜模式：卡片等浅色面板改用深色，避免刺眼
   reco 主题由 applyMode.js 给 <html> 加 .dark 类切换暗色，故用 html.dark 而非媒体查询 */
html.dark .face-card,
html.dark .face-proof,
html.dark .face-access-col {
  background: #202020;
  border-color: rgba(255, 255, 255, .1);
  box-shadow: 0 3px 12px rgba(0, 0, 0, .35);
}
html.dark .face-card:hover { box-shadow: 0 8px 22px rgba(0, 0, 0, .45); }
html.dark .face-card-title,
html.dark .face-access-col .face-access-title { color: rgba(255, 255, 255, .88); }
html.dark .face-card-desc,
html.dark .face-access-col p,
html.dark .face-proof-note { color: #8b8b8b; }
html.dark .face-card-tags span { color: #7fd9b0; background: rgba(62, 175, 124, .18); }
html.dark .face-proof-cap { color: #8b8b8b; }
html.dark .face-data-row { background: rgba(255, 255, 255, .05); color: rgba(255, 255, 255, .7); }
html.dark .face-data-row b { color: rgba(255, 255, 255, .9); }
html.dark .face-access-col ul { color: #a8a8a8; }
</style>
