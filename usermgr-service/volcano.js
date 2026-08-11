// 火山引擎 DynamicRegister 调用模块
// 文档：https://docs.volcengine.com/docs/6348/1904602
// 流程：服务端用 product_secret 签名 → 调用火山 API → 拿回加密的 device_secret
const crypto = require('crypto');
const https = require('https');

const VOLCANO_API_HOST = 'iot-cn-shanghai.iot.volces.com';
const VOLCANO_API_PATH = '/2021-12-14/DynamicRegister';

/**
 * 计算火山签名
 * content = "auth_type={}&device_name={}&random_num={}&product_key={}&timestamp={}"
 * signature = Base64(HMAC-SHA256(product_secret, content))
 */
function signSignature(productSecret, params) {
  const content = `auth_type=${params.auth_type}&device_name=${params.device_name}&random_num=${params.random_num}&product_key=${params.product_key}&timestamp=${params.timestamp}`;
  const h = crypto.createHmac('sha256', productSecret).update(content, 'utf8').digest();
  return h.toString('base64');
}

/**
 * 调用火山 DynamicRegister
 * @param {Object} cfg - { instance_id, product_key, product_secret }
 * @param {String} deviceName - 设备名（产品下唯一，推荐 SN）
 * @returns {Promise<{device_secret: string}>}
 */
function dynamicRegister(cfg, deviceName) {
  return new Promise((resolve, reject) => {
    const params = {
      product_key: cfg.product_key,
      device_name: deviceName,
      random_num: Math.floor(Math.random() * 1000000),
      timestamp: Date.now(),
      auth_type: 1,
    };
    params.signature = signSignature(cfg.product_secret, params);

    const body = new URLSearchParams({
      InstanceID: cfg.instance_id,
      product_key: params.product_key,
      device_name: params.device_name,
      random_num: String(params.random_num),
      timestamp: String(params.timestamp),
      auth_type: String(params.auth_type),
      signature: params.signature,
    }).toString();

    const query = 'Action=DynamicRegister&Version=2021-12-14';
    const path = `${VOLCANO_API_PATH}?${query}`;

    const req = https.request({
      hostname: VOLCANO_API_HOST,
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ResponseMetadata?.Error) {
            const e = json.ResponseMetadata.Error;
            return reject(new Error(`Volcano API error: ${e.Code || ''} ${e.Message || ''}`));
          }
          if (!json.Result?.payload) {
            return reject(new Error('Volcano API: missing payload'));
          }
          // payload 是加密的 device_secret，Base64 编码
          // 注意：火山返回的 payload 可能需要用 product_secret 解密，
          // 但根据文档说明，payload 即为 device_secret（Base64）。
          // 实际接入时如需解密，在此处理。
          resolve({ device_secret: json.Result.payload });
        } catch (e) {
          reject(new Error(`Volcano API parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Volcano API timeout')); });
    req.write(body);
    req.end();
  });
}

/**
 * 续期火山 License（设备服务期 +N 年）
 *
 * 官方计费说明：火山 License 一年有效期，第二年续期 = 购买新 License 并绑定到该设备，
 * 而不是重新 DynamicRegister（DynamicRegister 只是首次激活注册设备，不续期）。
 * 所以本函数实现的是：为已有设备（volcano_device_name）购买新 License 并绑定。
 *
 * 真实接入需要调用火山 IoT 控制台对应 API（具体 Action/参数以火山官方文档为准）。
 *
 * 当前实现策略：
 *   - VOLCANO_ENABLED !== 'true' 时：返回 mock 结果（测试/未接入阶段）
 *   - VOLCANO_ENABLED === 'true' 时：调用真实火山 API（TODO：填入购买+绑定 License 的 Action 与签名）
 *
 * @param {Object} cfg - { instance_id, product_key, product_secret }
 * @param {Object} params - { device_name, years, license_id? }
 * @returns {Promise<{ license_id: string, expires_at: string }>}
 */
function renewLicense(cfg, params) {
  if (process.env.VOLCANO_ENABLED !== 'true') {
    // mock：直接返回成功，过期时间为 N 年后
    const exp = new Date(Date.now() + params.years * 365 * 24 * 60 * 60 * 1000).toISOString();
    return Promise.resolve({
      license_id: params.license_id || ('MOCK-LIC-' + crypto.randomBytes(4).toString('hex')),
      expires_at: exp,
    });
  }

  // TODO: 真实接入时，在此调用火山 License 续期 API
  // 参考 https://docs.volcengine.com/docs/6348/1806625
  // 1. 用 product_secret 签名
  // 2. POST 到火山对应 Action（如 RenewLicense）
  // 3. 解析返回的 license_id 与 expires_at
  return new Promise((resolve, reject) => {
    reject(new Error('volcano renewLicense not implemented (VOLCANO_ENABLED=true)'));
  });
}

module.exports = { dynamicRegister, signSignature, renewLicense };
