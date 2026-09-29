import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const scenePath = path.join(root, '.vuepress/public/img/games/xiangqi-cover-scene.webp')
const outputPath = path.join(root, '.vuepress/public/img/games/xiangqi-cover.svg')
const scene = fs.readFileSync(scenePath).toString('base64')

const W = 1600
const H = 900
const topLeft = 315
const topRight = 1285
const bottomLeft = 228
const bottomRight = 1372
const topY = 578
const bottomY = 816
const xAt = (file, rank) => {
  const t = rank / 9
  const left = topLeft + (bottomLeft - topLeft) * t
  const right = topRight + (bottomRight - topRight) * t
  return left + (right - left) * file / 8
}
const yAt = (rank) => topY + (bottomY - topY) * rank / 9
const point = (file, rank) => `${xAt(file, rank).toFixed(1)},${yAt(rank).toFixed(1)}`
const line = (fileA, rankA, fileB, rankB, extra = '') =>
  `<line x1="${xAt(fileA, rankA).toFixed(1)}" y1="${yAt(rankA).toFixed(1)}" x2="${xAt(fileB, rankB).toFixed(1)}" y2="${yAt(rankB).toFixed(1)}" ${extra}/>`

const grid = []
for (let rank = 0; rank < 10; rank++) grid.push(line(0, rank, 8, rank))
for (let file = 0; file < 9; file++) {
  if (file === 0 || file === 8) grid.push(line(file, 0, file, 9))
  else {
    grid.push(line(file, 0, file, 4))
    grid.push(line(file, 5, file, 9))
  }
}
grid.push(line(3, 0, 5, 2, 'class="palace"'))
grid.push(line(5, 0, 3, 2, 'class="palace"'))
grid.push(line(3, 7, 5, 9, 'class="palace"'))
grid.push(line(5, 7, 3, 9, 'class="palace"'))

const pieces = []
const backRank = { red: '车马相仕帅仕相马车', black: '车马象士将士象马车' }
for (const side of ['black', 'red']) {
  const rank = side === 'black' ? 0 : 9
  for (let file = 0; file < 9; file++) pieces.push({ side, label: [...backRank[side]][file], file, rank })
  const cannonRank = side === 'black' ? 2 : 7
  for (const file of [1, 7]) pieces.push({ side, label: '炮', file, rank: cannonRank })
  const pawnRank = side === 'black' ? 3 : 6
  for (const file of [0, 2, 4, 6, 8]) pieces.push({ side, label: side === 'black' ? '卒' : '兵', file, rank: pawnRank })
}

const pieceMarkup = pieces.map(({ side, label, file, rank }) => {
  const px = xAt(file, rank).toFixed(1)
  const py = yAt(rank).toFixed(1)
  return `<g class="piece ${side}" transform="translate(${px} ${py})">
    <ellipse class="shadow" cy="5" rx="22" ry="15"/>
    <ellipse class="side" cy="2" rx="21" ry="15"/>
    <ellipse class="face" cy="-1" rx="20" ry="14"/>
    <ellipse class="rim" cy="-1" rx="15.5" ry="10.7"/>
    <ellipse class="shine" cx="-6" cy="-6" rx="7" ry="2.4"/>
    <text y="4" text-anchor="middle">${label}</text>
  </g>`
}).join('\n')

const leftRiver = [point(0, 4), point(8, 4), point(8, 5), point(0, 5)].join(' ')
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title description">
  <title id="title">中国象棋卡通封面</title>
  <desc id="description">两位卡通棋手对弈，棋盘呈标准横向楚河汉界与中国象棋标准初始阵型。</desc>
  <defs>
    <linearGradient id="wood-edge" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#a96936"/><stop offset=".55" stop-color="#784524"/><stop offset="1" stop-color="#4b2c1b"/></linearGradient>
    <linearGradient id="wood-face" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f9dc9a"/><stop offset=".48" stop-color="#edc47c"/><stop offset="1" stop-color="#ce9251"/></linearGradient>
    <linearGradient id="red-piece" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff8e6"/><stop offset=".54" stop-color="#f3dfbd"/><stop offset="1" stop-color="#d5ad70"/></linearGradient>
    <linearGradient id="black-piece" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff4da"/><stop offset=".52" stop-color="#e8dcc2"/><stop offset="1" stop-color="#c4b18a"/></linearGradient>
    <filter id="board-shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#26150d" flood-opacity=".52"/></filter>
  </defs>
  <image x="0" y="0" width="1600" height="900" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/webp;base64,${scene}"/>
  <g filter="url(#board-shadow)">
    <path d="M252 536 L1348 536 L1470 857 L130 857 Z" fill="url(#wood-edge)" stroke="#4e2e1a" stroke-width="8"/>
    <path d="M278 548 L1322 548 Q1333 549 1338 561 L1445 832 Q1449 844 1434 845 L166 845 Q151 844 155 832 L262 561 Q267 549 278 548 Z" fill="url(#wood-face)" stroke="#f3d19a" stroke-width="3"/>
    <path d="M294 561 L1306 561 L1424 831 L176 831 Z" fill="none" stroke="#a76d38" stroke-width="3" opacity=".9"/>
    <polygon points="${leftRiver}" fill="#f5d89d" opacity=".48"/>
    <g class="grid">${grid.join('')}</g>
    <g class="river-labels"><text x="486" y="703">楚河</text><text x="1114" y="703">汉界</text></g>
    <g class="pieces">${pieceMarkup}</g>
  </g>
  <style>
    .grid line{stroke:#65452c;stroke-width:2.7;stroke-linecap:round;opacity:.91}
    .grid .palace{stroke-width:3.1}
    .river-labels{font-family:"Kaiti SC","STKaiti","KaiTi",serif;font-size:29px;font-weight:700;letter-spacing:9px;text-anchor:middle;fill:#96643b;opacity:.92}
    .piece .shadow{fill:#422719;opacity:.36}
    .piece .side{fill:#9e673a;stroke:#684221;stroke-width:1.6}
    .piece .face{fill:url(#red-piece);stroke:#a8743c;stroke-width:2}
    .piece.black .face{fill:url(#black-piece);stroke:#635849}
    .piece .rim{fill:none;stroke:#c2914a;stroke-width:1.8}
    .piece.black .rim{stroke:#746958}
    .piece .shine{fill:#fffaf0;opacity:.42}
    .piece text{font-family:"Kaiti SC","STKaiti","KaiTi",serif;font-size:19px;font-weight:900;fill:#b93229}
    .piece.black text{fill:#292d28}
  </style>
</svg>`

fs.writeFileSync(outputPath, svg)
console.log(`Wrote ${path.relative(root, outputPath)} with ${pieces.length} correctly placed opening pieces.`)
