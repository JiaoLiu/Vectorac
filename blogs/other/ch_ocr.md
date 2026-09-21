::: warning 文字识别
免费多场景、高精度的文字检测与识别服务。可广泛适用于远程身份认证、财税报销、文档电子化等场景，为企业降本增效；提供稳定易用的在线 API、软件部署包多种服务形式。
:::

<div class="ocr-hero">
  <div class="ocr-hero-inner">
    <div class="ocr-hero-text">
      <h1>高精度中文 OCR 文字识别</h1>
      <p>卡证 · 票据 · 文档，毫秒级检测识别，返回结构化文本。支持在线 API 与私有化部署。</p>
      <div class="ocr-hero-cta">
        <a href="#demo" class="ocr-btn ocr-btn-primary">在线体验</a>
      </div>
    </div>
  </div>
</div>

## 四大识别能力

<div class="ocr-grid">
  <div class="ocr-card">
    <div class="ocr-card-icon">🪪</div>
    <div class="ocr-card-title">卡证文字识别</div>
    <div class="ocr-card-desc">结构化识别身份证、银行卡、营业执照、护照、户口本等常用卡证。</div>
    <div class="ocr-card-tags"><span>身份认证</span><span>金融开户</span><span>商户入驻</span></div>
  </div>
  <div class="ocr-card">
    <div class="ocr-card-icon">🧾</div>
    <div class="ocr-card-title">财务票据识别</div>
    <div class="ocr-card-desc">增值税发票、机打发票、火车票、出租车票、行程单、银行回单等 10 余种。</div>
    <div class="ocr-card-tags"><span>财税报销</span><span>税务核算</span></div>
  </div>
  <div class="ocr-card">
    <div class="ocr-card-icon">🏥</div>
    <div class="ocr-card-title">医疗票据识别</div>
    <div class="ocr-card-desc">医疗发票、费用结算单、病案首页、保险单，支持全国范围内单据。</div>
    <div class="ocr-card-tags"><span>保险理赔</span><span>健康管理</span></div>
  </div>
  <div class="ocr-card">
    <div class="ocr-card-icon">🚗</div>
    <div class="ocr-card-title">汽车场景识别</div>
    <div class="ocr-card-desc">行驶证、驾驶证、车牌、VIN 码、车辆合格证等购车用车全流程卡证。</div>
    <div class="ocr-card-tags"><span>车辆登记</span><span>二手车</span></div>
  </div>
</div>

## 效果实证

<div class="ocr-proof">
  <div class="ocr-proof-img">
    <img src="/ch_ocr/image?name=temp.jpg&raw=1" alt="身份证识别示例" loading="lazy">
    <div class="ocr-proof-cap">原始图片（身份证）</div>
  </div>
  <div class="ocr-proof-out">
    <div class="ocr-proof-cap">识别结果</div>
    <div class="ocr-proof-lines">
      <div class="ocr-line hl"><b>姓名</b>　陈朋涛</div>
      <div class="ocr-line hl"><b>性别</b>　男　<b>民族</b>　汉</div>
      <div class="ocr-line hl"><b>出生</b>　1989 年 6 月 01 日</div>
      <div class="ocr-line hl"><b>住址</b>　山东省滕州市龙阳镇</div>
      <div class="ocr-line hl"><b>公民身份号码</b>　532101198906010015</div>
    </div>
    <div class="ocr-proof-note">关键字段精准提取，正/反面、复杂背景下均稳定识别。</div>
  </div>
</div>

## 核心指标

| 维度 | 说明 |
| --- | --- |
| 识别语言 | 简体中文、英文，支持中英混排 |
| 识别速度 | 单张卡证约 1~2 秒（CPU），视图片复杂度而定 |
| 返回内容 | 文字内容 + 位置坐标 + 置信度，可做字段结构化 |
| 接入方式 | 在线 HTTP API（任意语言）/ 私有化部署包 |
| 数据安全 | 私有化部署可完全离线运行，数据不出内网 |
| 适用环境 | 普通 CPU 服务器即可运行，无需 GPU |

## 接入方式

<div class="ocr-access">
  <div class="ocr-access-col">
    <div class="ocr-access-title">在线 API</div>
    <p>HTTP 接口调用，上传图片即返回识别文本，几行代码即可集成：</p>

```bash
# 1. 上传图片
curl -X POST https://vectorac.com/ch_ocr/upload \
  -F "file=@/path/to/idcard.jpg"
# → {"code":200,"name":"idcard.jpg"}

# 2. 获取识别结果
curl "https://vectorac.com/ch_ocr/ocr?img=idcard.jpg"
# → ["姓名 陈朋涛","性别 男 民族 汉", ...]
```

  </div>
  <div class="ocr-access-col">
    <div class="ocr-access-title">私有化部署</div>
    <p>提供软件部署包，可在本地服务器运行，适用于安全级别较高的内网环境：</p>
    <ul>
      <li>完全离线，数据不出企业内网</li>
      <li>普通 CPU 服务器即可，无需 GPU</li>
      <li>支持 Docker / 裸机部署</li>
      <li>提供部署文档与技术对接支持</li>
    </ul>
  </div>
</div>

<div id="demo"></div>

## 在线体验

点击下方示例图或上传自己的图片，立即体验识别效果（识别在浏览器与服务器间完成，图片不会被保存）：

 <iframe  
 id="ocrDemoFrame"
 class="ocr-demo-iframe"
 width=100% 
 src="https://vectorac.com/ch_ocr"  
 frameborder=0  
 scrolling="auto"
 allowfullscreen style="background-color:#f4f6fb;border-radius:12px;">
 </iframe>

## 联系我们

<div class="ocr-contact">
  <p>需要 <b>API 接入文档</b>、<b>私有化部署方案</b>，或有任何合作意向？欢迎联系我们，我们会在 1 个工作日内回复。</p>
  <a href="mailto:support@vectorac.com" class="ocr-btn ocr-btn-primary">📧 support@vectorac.com</a>
</div>

<style>
/* Hero */
.ocr-hero {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  margin: 18px 0 8px;
  background: #0f1f3d url('/img/ocr/hero.png') right center / cover no-repeat;
}
.ocr-hero::before {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(90deg, rgba(10,20,45,.92) 0%, rgba(10,20,45,.72) 45%, rgba(10,20,45,.28) 100%);
}
.ocr-hero-inner { position: relative; padding: 54px 40px; max-width: 620px; }
.ocr-hero-text h1 { color: #fff; font-size: 32px; font-weight: 800; margin: 0 0 14px; letter-spacing: 1px; }
.ocr-hero-text p { color: #c3d2ee; font-size: 15px; line-height: 1.7; margin: 0 0 24px; }
.ocr-hero-cta { display: flex; gap: 14px; flex-wrap: wrap; }

.ocr-btn {
  display: inline-block; padding: 11px 26px; border-radius: 24px; font-size: 15px; font-weight: 600;
  text-decoration: none; transition: all .2s; cursor: pointer;
}
.ocr-btn-primary {
  background: linear-gradient(135deg, #4a6cf7, #7a5af8); color: #fff !important;
  box-shadow: 0 4px 14px rgba(74,108,247,.4);
}
.ocr-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(74,108,247,.5); }
.ocr-btn-ghost { background: rgba(255,255,255,.14); color: #fff !important; border: 1px solid rgba(255,255,255,.4); }
.ocr-btn-ghost:hover { background: rgba(255,255,255,.24); }

/* 能力网格 */
.ocr-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 12px 0; }
.ocr-card {
  background: #fff; border: 1px solid #eef0f5; border-radius: 14px; padding: 20px 18px;
  box-shadow: 0 3px 12px rgba(40,60,120,.05); transition: all .2s;
}
.ocr-card:hover { transform: translateY(-3px); box-shadow: 0 8px 22px rgba(40,60,120,.1); }
.ocr-card-icon { font-size: 30px; margin-bottom: 10px; }
.ocr-card-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; color: #2c3e50; }
.ocr-card-desc { font-size: 12.5px; line-height: 1.65; color: #8492a6; margin-bottom: 12px; min-height: 60px; }
.ocr-card-tags span {
  display: inline-block; font-size: 11px; color: #4a6cf7; background: #eef2ff;
  padding: 3px 9px; border-radius: 11px; margin: 0 5px 5px 0;
}

/* 效果实证 */
.ocr-proof {
  display: flex; gap: 22px; align-items: flex-start; background: #fff;
  border: 1px solid #eef0f5; border-radius: 14px; padding: 22px; box-shadow: 0 3px 12px rgba(40,60,120,.05);
}
.ocr-proof-img { flex: 1; min-width: 0; }
.ocr-proof-img img { width: 100%; border-radius: 10px; border: 1px solid #eef0f5; display: block; }
.ocr-proof-cap { font-size: 12px; color: #a5b1c5; margin: 8px 0; }
.ocr-proof-out { flex: 1; min-width: 0; }
.ocr-proof-lines { margin-top: 4px; }
.ocr-line { font-size: 14px; padding: 9px 12px; border-radius: 8px; background: #f6f8fc; margin-bottom: 8px; color: #3a4a63; }
.ocr-line.hl { background: #fff5e6; border: 1px solid #ffd591; }
.ocr-line b { color: #2c3e50; }
.ocr-proof-note { font-size: 12px; color: #8492a6; margin-top: 10px; }

/* 接入方式 */
.ocr-access { display: flex; gap: 22px; }
.ocr-access-col {
  flex: 1; min-width: 0; background: #fff; border: 1px solid #eef0f5;
  border-radius: 14px; padding: 20px 22px; box-shadow: 0 3px 12px rgba(40,60,120,.05);
}
.ocr-access-col .ocr-access-title { font-size: 16px; font-weight: 700; margin-bottom: 10px; color: #2c3e50; }
.ocr-access-col p { font-size: 13px; color: #8492a6; line-height: 1.7; }
.ocr-access-col ul { font-size: 13px; color: #5a6b85; line-height: 1.9; padding-left: 18px; margin: 8px 0 0; }

/* 联系 */
.ocr-contact {
  text-align: center; background: linear-gradient(135deg, #0f1f3d, #1d3160);
  border-radius: 16px; padding: 34px 24px; margin-top: 10px;
}
.ocr-contact p { color: #c3d2ee; font-size: 14.5px; line-height: 1.7; margin: 0 0 18px; }

/* 演示 iframe：可滚动，固定高度（桌面 900 / 移动 700） */
.ocr-demo-iframe { height: 900px; }

/* 响应式 */
@media (max-width: 960px) {
  .ocr-grid { grid-template-columns: repeat(2, 1fr); }
  .ocr-hero-inner { padding: 40px 26px; }
}
@media (max-width: 640px) {
  /* Hero：移动端用纯渐变，隐藏复杂背景图，文字按钮清爽 */
  .ocr-hero { background: linear-gradient(135deg, #10224a 0%, #1d3160 60%, #27408b 100%); }
  .ocr-hero::before { display: none; }
  .ocr-hero-inner { padding: 30px 20px; max-width: 100%; text-align: center; }
  .ocr-hero-text h1 { font-size: 22px; margin-bottom: 10px; }
  .ocr-hero-text p { font-size: 13px; line-height: 1.6; margin-bottom: 18px; }
  .ocr-hero-cta { display: flex; justify-content: center; gap: 10px; }
  .ocr-hero-cta .ocr-btn { padding: 11px 40px; font-size: 14px; text-align: center; }

  .ocr-grid { grid-template-columns: 1fr; gap: 12px; }
  .ocr-card-desc { min-height: 0; }
  .ocr-proof { flex-direction: column; padding: 16px; }
  .ocr-access { flex-direction: column; gap: 14px; }
  .ocr-demo-iframe { height: 700px; }
}
</style>
