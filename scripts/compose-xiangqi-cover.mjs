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
const topY = 567
const bottomY = 813
const xAt = (file, rank) => {
  const t = rank / 9
  const left = topLeft + (bottomLeft - topLeft) * t
  const right = topRight + (bottomRight - topRight) * t
  return left + (right - left) * file / 8
}
const yAt = (rank) => topY + (bottomY - topY) * rank / 9
const riverLabelY = ((yAt(4) + yAt(5)) / 2 + 6).toFixed(1)
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
  const perspective = (0.84 + rank * 0.027).toFixed(3)
  return `<g class="piece ${side}" transform="translate(${px} ${py}) scale(${perspective})">
    <ellipse class="shadow" cy="6" rx="26" ry="17"/>
    <ellipse class="side" cy="4" rx="25.5" ry="17.2"/>
    <ellipse class="bevel" cy="1.5" rx="24.7" ry="16.8"/>
    <ellipse class="face" cy="-1" rx="23.8" ry="15.9"/>
    <ellipse class="rim" cy="-1" rx="18.2" ry="11.8"/>
    <ellipse class="shine" cx="-7" cy="-6" rx="8" ry="2.8"/>
    <text y="4" text-anchor="middle" transform="${side === 'black' ? 'rotate(180)' : ''}">${label}</text>
  </g>`
}).join('\n')

const leftRiver = [point(0, 4), point(8, 4), point(8, 5), point(0, 5)].join(' ')
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title description">
  <title id="title">中国象棋卡通封面</title>
  <desc id="description">两位卡通棋手对弈，棋盘呈标准横向楚河汉界与中国象棋标准初始阵型。</desc>
  <defs>
    <linearGradient id="wood-edge" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#a96032"/><stop offset=".48" stop-color="#784323"/><stop offset="1" stop-color="#452719"/></linearGradient>
    <linearGradient id="wood-face" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="#c8894d"/><stop offset=".5" stop-color="#b87842"/><stop offset="1" stop-color="#99572f"/></linearGradient>
    <linearGradient id="red-piece" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff5dc"/><stop offset=".54" stop-color="#ead4aa"/><stop offset="1" stop-color="#c79d62"/></linearGradient>
    <linearGradient id="black-piece" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f6ecd3"/><stop offset=".52" stop-color="#dfcfaa"/><stop offset="1" stop-color="#b9a47d"/></linearGradient>
    <filter id="board-shadow" x="-12%" y="-15%" width="124%" height="135%"><feDropShadow dx="0" dy="7" stdDeviation="8" flood-color="#28170f" flood-opacity=".34"/></filter>
    <clipPath id="board-face-clip"><path d="M278 558 L1322 558 L1427 833 L173 833 Z"/></clipPath>
  </defs>
  <image x="0" y="0" width="1600" height="900" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/webp;base64,${scene}"/>
  <g filter="url(#board-shadow)">
    <path d="M252 534 L1348 534 L1470 850 L130 850 Z" fill="url(#wood-edge)" stroke="#4e2e1a" stroke-width="5"/>
    <path d="M269 542 L1331 542 L1452 840 L148 840 Z" fill="url(#wood-face)" stroke="#d49b60" stroke-width="2"/>
    <path d="M290 553 L1310 553 L1428 837 L172 837 Z" fill="none" stroke="#e0ae72" stroke-width="2" opacity=".7"/>
    <g clip-path="url(#board-face-clip)" class="grain">
      <path d="M390 535 Q420 680 475 845 M565 535 Q590 680 620 845 M790 535 Q800 680 800 845 M1010 535 Q995 680 980 845 M1215 535 Q1175 680 1128 845"/>
      <path d="M250 646 Q800 620 1350 646 M205 758 Q800 738 1395 758"/>
    </g>
    <polygon points="${leftRiver}" fill="#e8b778" opacity=".12"/>
    <g class="grid">${grid.join('')}</g>
    <g class="river-labels"><text x="486" y="${riverLabelY}">楚河</text><text x="1114" y="${riverLabelY}">汉界</text></g>
    <g class="pieces">${pieceMarkup}</g>
  </g>
  <style>
    .grain path{fill:none;stroke:#f4c58d;stroke-width:2;opacity:.09}
    .grid line{stroke:#59391f;stroke-width:2.3;stroke-linecap:round;opacity:.78}
    .grid .palace{stroke-width:2.7}
    .river-labels{font-family:"Kaiti SC","STKaiti","KaiTi",serif;font-size:28px;font-weight:700;letter-spacing:9px;text-anchor:middle;fill:#f1d4a4;opacity:.88}
    .piece .shadow{fill:#352013;opacity:.39}
    .piece .side{fill:#986039;stroke:#684221;stroke-width:1.7}
    .piece .bevel{fill:#e7c184;stroke:#8a592f;stroke-width:1.2}
    .piece .face{fill:url(#red-piece);stroke:#a8743c;stroke-width:2}
    .piece.black .face{fill:url(#black-piece);stroke:#635849}
    .piece .rim{fill:none;stroke:#c2914a;stroke-width:1.9}
    .piece.black .rim{stroke:#746958}
    .piece .shine{fill:#fffaf0;opacity:.42}
    .piece text{font-family:"Kaiti SC","STKaiti","KaiTi",serif;font-size:19px;font-weight:900;fill:#b93229}
    .piece.black text{fill:#292d28}
  </style>
</svg>`

fs.writeFileSync(outputPath, svg)
console.log(`Wrote ${path.relative(root, outputPath)} with the integrated board and ${pieces.length} correctly placed opening pieces.`)
