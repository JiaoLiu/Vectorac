import assert from 'node:assert/strict'
import test from 'node:test'
import { BOARD } from '../.vuepress/components/junqi/engine.mjs'
import { boardViewAngle, nodeViewAngle, nodeLocalAngle } from '../.vuepress/components/junqi/presentation.mjs'

const normal = angle => ((angle + 180) % 360 + 360) % 360 - 180

test('all four player views place their own army at the bottom and keep regional tile directions', () => {
  for (let viewer = 0; viewer < 4; viewer++) {
    const radians = boardViewAngle(viewer) * Math.PI / 180
    for (let relative = 0; relative < 4; relative++) {
      const seat = (viewer + relative) % 4
      const hq = BOARD.byId[`${seat}:5:2`]
      const dx = hq.x - 8, dy = hq.y - 8
      const x = Math.round(dx * Math.cos(radians) - dy * Math.sin(radians)) || 0
      const y = Math.round(dx * Math.sin(radians) + dy * Math.cos(radians)) || 0
      assert.deepEqual([x, y], [[0, 8], [-8, 0], [0, -8], [8, 0]][relative])
    }
    for (const node of BOARD.nodes) {
      const relative = (node.seat - viewer + 4) % 4
      const expected = node.seat < 0 ? 0 : [0, 90, 0, -90][relative]
      assert.equal(nodeViewAngle(node.seat, viewer), expected)
      assert.equal(normal(boardViewAngle(viewer) + nodeLocalAngle(node.seat, viewer)), expected,
        `viewer ${viewer}, node ${node.id}: board and tile transforms compose correctly`)
    }
  }
})

test('a tile crossing arm → shared railway → either side follows destination, for every player', () => {
  for (let viewer = 0; viewer < 4; viewer++) {
    const path = [viewer, -1, (viewer + 1) % 4, -1, (viewer + 3) % 4, (viewer + 2) % 4]
    assert.deepEqual(path.map(region => normal(boardViewAngle(viewer) + nodeLocalAngle(region, viewer))),
      [0, 0, 90, 0, -90, 0])
  }
})
