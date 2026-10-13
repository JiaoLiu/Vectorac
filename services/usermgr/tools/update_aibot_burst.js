#!/usr/bin/env node
'use strict';

// Query the existing Aibot first, merge AgentConfig.Burst without losing the
// welcome message/TTS/function-calling configuration, update it, then query
// again to verify the server-side value. No credentials are written to disk.

const crypto = require('crypto');
const https = require('https');

const HOST = 'rtc.volcengineapi.com';
const SERVICE = 'rtc';
const REGION = 'cn-north-1';
const VERSION = '2025-08-01';

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length
    ? process.argv[index + 1]
    : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function utcStamp(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function canonicalQuery(params) {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function signRequest({ accessKeyId, secretAccessKey, action, body, now = new Date() }) {
  const xDate = utcStamp(now);
  const shortDate = xDate.slice(0, 8);
  const payloadHash = sha256(body);
  const query = canonicalQuery({ Action: action, Version: VERSION });
  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonicalHeaders =
    'content-type:application/json\n' +
    `host:${HOST}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${xDate}\n`;
  const canonicalRequest =
    `POST\n/\n${query}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${shortDate}/${REGION}/${SERVICE}/request`;
  const stringToSign = `HMAC-SHA256\n${xDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const kDate = hmac(Buffer.from(secretAccessKey, 'utf8'), shortDate);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, 'request');
  const signature = hmac(kSigning, stringToSign, 'hex');
  return {
    path: `/?${query}`,
    headers: {
      'Content-Type': 'application/json',
      Host: HOST,
      'X-Content-Sha256': payloadHash,
      'X-Date': xDate,
      Authorization:
        `HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'Content-Length': Buffer.byteLength(body),
    },
  };
}

function callOpenApi(credentials, action, payload) {
  const body = JSON.stringify(payload);
  const signed = signRequest({ ...credentials, action, body });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HOST,
      port: 443,
      path: signed.path,
      method: 'POST',
      headers: signed.headers,
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(data);
        } catch (error) {
          return reject(new Error(`HTTP ${res.statusCode}: invalid JSON: ${data.slice(0, 300)}`));
        }
        const meta = json.ResponseMetadata || {};
        if (res.statusCode < 200 || res.statusCode >= 300 || meta.Error) {
          const detail = meta.Error
            ? `${meta.Error.Code || ''} ${meta.Error.Message || ''}`.trim()
            : `HTTP ${res.statusCode}`;
          const requestId = meta.RequestId ? ` requestId=${meta.RequestId}` : '';
          return reject(new Error(`${action} failed: ${detail}${requestId}`));
        }
        resolve(json);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`${action} timeout`)));
    req.write(body);
    req.end();
  });
}

function readSecret(label) {
  if (!process.stdin.isTTY) {
    return Promise.reject(new Error(`${label} is missing and stdin is not a TTY`));
  }
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = '';
    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (char) => {
      if (char === '\u0003') {
        cleanup();
        reject(new Error('cancelled'));
      } else if (char === '\r' || char === '\n') {
        cleanup();
        stdout.write('\n');
        resolve(value.trim());
      } else if (char === '\u007f' || char === '\b') {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

function findBot(queryJson, botId) {
  const bots = queryJson && queryJson.Result && queryJson.Result.Bots;
  if (!Array.isArray(bots)) throw new Error('AibotQuery response has no Result.Bots');
  const bot = bots.find((item) => item && item.Id === botId);
  if (!bot) throw new Error(`AibotQuery did not return bot ${botId}`);
  return bot;
}

function printUsage() {
  console.log(`Usage:
  node tools/update_aibot_burst.js --bot-id BOT_ID [--buffer-size 1500] [--interval 20] [--apply]

Credentials (never stored):
  VOLC_ACCESS_KEY_ID / VOLC_SECRET_ACCESS_KEY environment variables,
  or enter them interactively when prompted.

Without --apply the script only queries and prints the proposed change.`);
}

async function main() {
  if (hasArg('--help') || hasArg('-h')) {
    printUsage();
    return;
  }
  const botId = argValue('--bot-id', process.env.VOLC_AIBOT_ID || '');
  const bufferSize = Number(argValue('--buffer-size', '1500'));
  const interval = Number(argValue('--interval', '20'));
  const apply = hasArg('--apply');
  if (!botId) throw new Error('--bot-id is required');
  if (!Number.isInteger(bufferSize) || bufferSize < 10 || bufferSize > 3600000) {
    throw new Error('--buffer-size must be an integer in [10, 3600000]');
  }
  if (!Number.isInteger(interval) || interval < 10 || interval > 600) {
    throw new Error('--interval must be an integer in [10, 600]');
  }

  const accessKeyId = process.env.VOLC_ACCESS_KEY_ID ||
    await readSecret('Volcengine AccessKey ID: ');
  const secretAccessKey = process.env.VOLC_SECRET_ACCESS_KEY ||
    await readSecret('Volcengine SecretAccessKey（隐藏输入）: ');
  if (!accessKeyId || !secretAccessKey) throw new Error('AccessKey/SecretAccessKey is empty');
  const credentials = { accessKeyId, secretAccessKey };

  const beforeJson = await callOpenApi(credentials, 'AibotQuery', { Id: botId });
  const beforeRequestId = beforeJson.ResponseMetadata && beforeJson.ResponseMetadata.RequestId;
  const bot = findBot(beforeJson, botId);
  const oldBurst = bot.AgentConfig && bot.AgentConfig.Burst;
  console.log(`[query] requestId=${beforeRequestId || '<missing>'}`);
  console.log(`[query] bot=${bot.Id} name=${bot.Name || ''}`);
  console.log(`[query] current Burst=${JSON.stringify(oldBurst || null)}`);

  const updatePayload = {
    Id: bot.Id,
    Name: bot.Name,
    Config: bot.Config || {},
    AgentConfig: {
      ...(bot.AgentConfig || {}),
      Burst: { Enable: true, BufferSize: bufferSize, Interval: interval },
    },
  };
  console.log(`[plan] AgentConfig.Burst=${JSON.stringify(updatePayload.AgentConfig.Burst)}`);
  if (!apply) {
    console.log('[dry-run] 未发送 AibotUpdate；确认后增加 --apply。');
    return;
  }

  const updateJson = await callOpenApi(credentials, 'AibotUpdate', updatePayload);
  const updateRequestId = updateJson.ResponseMetadata && updateJson.ResponseMetadata.RequestId;
  console.log(`[update] success requestId=${updateRequestId || '<missing>'}`);

  const afterJson = await callOpenApi(credentials, 'AibotQuery', { Id: botId });
  const afterRequestId = afterJson.ResponseMetadata && afterJson.ResponseMetadata.RequestId;
  const afterBot = findBot(afterJson, botId);
  const actual = afterBot.AgentConfig && afterBot.AgentConfig.Burst;
  console.log(`[verify] requestId=${afterRequestId || '<missing>'}`);
  console.log(`[verify] AgentConfig.Burst=${JSON.stringify(actual || null)}`);
  if (!actual || actual.Enable !== true ||
      Number(actual.BufferSize) !== bufferSize || Number(actual.Interval) !== interval) {
    throw new Error('AibotUpdate returned success but Burst verification did not match');
  }
  console.log('[verify] ✓ Burst server configuration is active');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[aibot-burst] ✗ ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { canonicalQuery, signRequest };
