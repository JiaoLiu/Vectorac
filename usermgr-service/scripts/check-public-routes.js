#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'public/admin/app.js'), 'utf8');
const account = fs.readFileSync(path.join(root, 'public/account/app.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'public/admin/index.html'), 'utf8');
const accountHtml = fs.readFileSync(path.join(root, 'public/account/index.html'), 'utf8');

const failures = [];
function check(ok, message) {
  if (!ok) failures.push(message);
}

// Public assets must remain relative so both /admin/ and /xiaov/admin/ work.
for (const [name, html] of [['admin', adminHtml], ['account', accountHtml]]) {
  check(!/(?:src|href)=["']\//.test(html), `${name}: static asset uses a root-absolute URL`);
}

check(admin.includes("const API = 'api';"), 'admin: API base must be relative to /xiaov/admin/');
check(account.includes('const API = `/${PRODUCT}/api`;'), 'account: API base must derive from product URL');

const serverRoutes = [...server.matchAll(/app\.(?:get|post|patch|put|delete)\(['"]([^'"]+)/g)]
  .map((m) => m[1]);
const adminCalls = [...admin.matchAll(/api\(['`]([^'`]+)/g)].map((m) => m[1].split('?')[0]);
const accountCalls = [...account.matchAll(/api\(['`]([^'`]+)/g)].map((m) => m[1].split('?')[0]);

function routeMatches(route, prefix, call) {
  const callParts = (prefix + call).split('/').filter(Boolean);
  const routeParts = route.split('/').filter(Boolean);
  if (call.endsWith('/')) {
    return callParts.every((part, i) => routeParts[i] === part || routeParts[i]?.startsWith(':'));
  }
  return callParts.length === routeParts.length
    && callParts.every((part, i) => routeParts[i] === part || routeParts[i]?.startsWith(':'));
}

for (const call of adminCalls) {
  check(serverRoutes.some((r) => routeMatches(r, '/admin/api', call)), `admin API has no server route: ${call}`);
}
for (const call of accountCalls) {
  check(serverRoutes.some((r) => routeMatches(r, '/:product/api', call)), `account API has no server route: ${call}`);
}

if (failures.length) {
  console.error(failures.map((x) => `ERROR: ${x}`).join('\n'));
  process.exit(1);
}
console.log(`Public route audit passed: ${adminCalls.length} admin calls, ${accountCalls.length} account calls.`);
