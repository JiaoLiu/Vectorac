// Jianghu108 endgame questions, adapted from destinybird/Jianghu108 (Apache-2.0).
// Coordinates are normalized to this project's 0-based board orientation.
export const JIANGHU108 = [
  {
    "id": "jianghu-001",
    "title": "双蛟翦水",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "R",
        1,
        9
      ],
      [
        "red",
        "C",
        1,
        6
      ],
      [
        "red",
        "C",
        1,
        3
      ],
      [
        "red",
        "K",
        5,
        8
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "black",
        "H",
        0,
        9
      ],
      [
        "black",
        "P",
        0,
        8
      ],
      [
        "black",
        "P",
        0,
        7
      ],
      [
        "black",
        "C",
        0,
        5
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "R",
        4,
        5
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "A",
        5,
        0
      ],
      [
        "black",
        "E",
        6,
        4
      ],
      [
        "black",
        "P",
        8,
        8
      ],
      [
        "black",
        "C",
        8,
        5
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮B7 B10+",
        "move": {
          "fromX": 1,
          "fromY": 3,
          "toX": 1,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "炮B4 E4+",
        "move": {
          "fromX": 1,
          "fromY": 6,
          "toX": 4,
          "toY": 6
        }
      },
      {
        "label": "C",
        "text": "車B1 E1",
        "move": {
          "fromX": 1,
          "fromY": 9,
          "toX": 4,
          "toY": 9
        }
      },
      {
        "label": "D",
        "text": "兵F9 x F10+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 5,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1GaYh6tEbn/"
  },
  {
    "id": "jianghu-002",
    "title": "斩魔伏怪",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        1,
        3
      ],
      [
        "red",
        "A",
        3,
        9
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "R",
        7,
        5
      ],
      [
        "red",
        "C",
        7,
        4
      ],
      [
        "red",
        "C",
        7,
        3
      ],
      [
        "black",
        "R",
        3,
        2
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "P",
        5,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "仕D1 E2",
        "move": {
          "fromX": 3,
          "fromY": 9,
          "toX": 4,
          "toY": 8
        }
      },
      {
        "label": "B",
        "text": "炮H7 D7+",
        "move": {
          "fromX": 7,
          "fromY": 3,
          "toX": 3,
          "toY": 3
        }
      },
      {
        "label": "C",
        "text": "炮H6 D6+",
        "move": {
          "fromX": 7,
          "fromY": 4,
          "toX": 3,
          "toY": 4
        }
      },
      {
        "label": "D",
        "text": "兵E9 E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1EhtB6CE5t/"
  },
  {
    "id": "jianghu-003",
    "title": "虎口抢食",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "H",
        0,
        4
      ],
      [
        "red",
        "C",
        2,
        5
      ],
      [
        "red",
        "K",
        5,
        7
      ],
      [
        "red",
        "P",
        6,
        2
      ],
      [
        "red",
        "R",
        8,
        0
      ],
      [
        "black",
        "A",
        3,
        2
      ],
      [
        "black",
        "R",
        4,
        8
      ],
      [
        "black",
        "R",
        4,
        2
      ],
      [
        "black",
        "A",
        5,
        2
      ],
      [
        "black",
        "K",
        5,
        1
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵G8 G9+",
        "move": {
          "fromX": 6,
          "fromY": 2,
          "toX": 6,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "兵G8 x F8+",
        "move": {
          "fromX": 6,
          "fromY": 2,
          "toX": 5,
          "toY": 2
        }
      },
      {
        "label": "C",
        "text": "炮C5 F5+",
        "move": {
          "fromX": 2,
          "fromY": 5,
          "toX": 5,
          "toY": 5
        }
      },
      {
        "label": "D",
        "text": "車I10 E10",
        "move": {
          "fromX": 8,
          "fromY": 0,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1YktB6KEkM/"
  },
  {
    "id": "jianghu-004",
    "title": "炮响催兵",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "P",
        1,
        2
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "P",
        6,
        1
      ],
      [
        "red",
        "P",
        7,
        0
      ],
      [
        "red",
        "C",
        8,
        5
      ],
      [
        "red",
        "R",
        8,
        4
      ],
      [
        "black",
        "P",
        3,
        6
      ],
      [
        "black",
        "R",
        3,
        2
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "P",
        5,
        7
      ],
      [
        "black",
        "P",
        6,
        9
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車I6 D6",
        "move": {
          "fromX": 8,
          "fromY": 4,
          "toX": 3,
          "toY": 4
        }
      },
      {
        "label": "B",
        "text": "炮I5 D5+",
        "move": {
          "fromX": 8,
          "fromY": 5,
          "toX": 3,
          "toY": 5
        }
      },
      {
        "label": "C",
        "text": "兵B8 C8",
        "move": {
          "fromX": 1,
          "fromY": 2,
          "toX": 2,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "兵E9 D9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1Fcbr6REHj/"
  },
  {
    "id": "jianghu-005",
    "title": "小挂印",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        4,
        2
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "C",
        6,
        4
      ],
      [
        "red",
        "C",
        7,
        8
      ],
      [
        "red",
        "P",
        7,
        4
      ],
      [
        "red",
        "R",
        8,
        8
      ],
      [
        "black",
        "P",
        0,
        6
      ],
      [
        "black",
        "H",
        2,
        8
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "R",
        6,
        0
      ],
      [
        "black",
        "R",
        7,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮H2 F2",
        "move": {
          "fromX": 7,
          "fromY": 8,
          "toX": 5,
          "toY": 8
        }
      },
      {
        "label": "B",
        "text": "炮H2 x H10+",
        "move": {
          "fromX": 7,
          "fromY": 8,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車I2 I7",
        "move": {
          "fromX": 8,
          "fromY": 8,
          "toX": 8,
          "toY": 3
        }
      },
      {
        "label": "D",
        "text": "炮H2 x C2",
        "move": {
          "fromX": 7,
          "fromY": 8,
          "toX": 2,
          "toY": 8
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV17xb66UEwV/"
  },
  {
    "id": "jianghu-006",
    "title": "长坂坡",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        2,
        2
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "P",
        5,
        4
      ],
      [
        "red",
        "C",
        6,
        4
      ],
      [
        "red",
        "P",
        6,
        2
      ],
      [
        "red",
        "R",
        7,
        2
      ],
      [
        "red",
        "R",
        8,
        2
      ],
      [
        "black",
        "E",
        0,
        2
      ],
      [
        "black",
        "C",
        0,
        0
      ],
      [
        "black",
        "P",
        1,
        9
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "A",
        5,
        2
      ],
      [
        "black",
        "K",
        5,
        1
      ],
      [
        "black",
        "P",
        6,
        5
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵G8 G9+",
        "move": {
          "fromX": 6,
          "fromY": 2,
          "toX": 6,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "兵G8 x F8+",
        "move": {
          "fromX": 6,
          "fromY": 2,
          "toX": 5,
          "toY": 2
        }
      },
      {
        "label": "C",
        "text": "車H8 H9+",
        "move": {
          "fromX": 7,
          "fromY": 2,
          "toX": 7,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "車I8 I9+",
        "move": {
          "fromX": 8,
          "fromY": 2,
          "toX": 8,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1ytbz6tEXR/"
  },
  {
    "id": "jianghu-007",
    "title": "梅花三六",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "C",
        1,
        4
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "H",
        7,
        1
      ],
      [
        "black",
        "E",
        2,
        4
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        5,
        1
      ],
      [
        "black",
        "R",
        5,
        0
      ],
      [
        "black",
        "E",
        6,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮B6 B10",
        "move": {
          "fromX": 1,
          "fromY": 4,
          "toX": 1,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "馬H9 G7+",
        "move": {
          "fromX": 7,
          "fromY": 1,
          "toX": 6,
          "toY": 3
        }
      },
      {
        "label": "C",
        "text": "炮B6 B9+",
        "move": {
          "fromX": 1,
          "fromY": 4,
          "toX": 1,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "帥E1 E2",
        "move": {
          "fromX": 4,
          "fromY": 9,
          "toX": 4,
          "toY": 8
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1obgs6dEJe/"
  },
  {
    "id": "jianghu-008",
    "title": "高瞻远瞩",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "C",
        1,
        5
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "R",
        4,
        6
      ],
      [
        "red",
        "P",
        6,
        1
      ],
      [
        "red",
        "H",
        7,
        0
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "R",
        3,
        0
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "C",
        5,
        9
      ],
      [
        "black",
        "K",
        5,
        0
      ],
      [
        "black",
        "R",
        6,
        9
      ],
      [
        "black",
        "C",
        7,
        9
      ],
      [
        "black",
        "H",
        7,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車E4 F4+",
        "move": {
          "fromX": 4,
          "fromY": 6,
          "toX": 5,
          "toY": 6
        }
      },
      {
        "label": "B",
        "text": "兵G9 G10+",
        "move": {
          "fromX": 6,
          "fromY": 1,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "兵G9 F9+",
        "move": {
          "fromX": 6,
          "fromY": 1,
          "toX": 5,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "炮B5 B10+",
        "move": {
          "fromX": 1,
          "fromY": 5,
          "toX": 1,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1xF3f6qE8D/"
  },
  {
    "id": "jianghu-009",
    "title": "高马出六",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "P",
        0,
        3
      ],
      [
        "red",
        "P",
        0,
        2
      ],
      [
        "red",
        "P",
        1,
        0
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "R",
        4,
        4
      ],
      [
        "red",
        "R",
        4,
        3
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "A",
        5,
        7
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "E",
        6,
        5
      ],
      [
        "red",
        "H",
        8,
        2
      ],
      [
        "black",
        "P",
        1,
        8
      ],
      [
        "black",
        "R",
        3,
        8
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "P",
        6,
        6
      ],
      [
        "black",
        "E",
        6,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "仕F3 E2",
        "move": {
          "fromX": 5,
          "fromY": 7,
          "toX": 4,
          "toY": 8
        }
      },
      {
        "label": "B",
        "text": "車E6 D6+",
        "move": {
          "fromX": 4,
          "fromY": 4,
          "toX": 3,
          "toY": 4
        }
      },
      {
        "label": "C",
        "text": "車E7 D7+",
        "move": {
          "fromX": 4,
          "fromY": 3,
          "toX": 3,
          "toY": 3
        }
      },
      {
        "label": "D",
        "text": "兵B10 C10+",
        "move": {
          "fromX": 1,
          "fromY": 0,
          "toX": 2,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1RDgZ6SEos/"
  },
  {
    "id": "jianghu-010",
    "title": "秋风扫叶",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "C",
        3,
        5
      ],
      [
        "red",
        "C",
        4,
        2
      ],
      [
        "red",
        "K",
        5,
        7
      ],
      [
        "black",
        "P",
        0,
        9
      ],
      [
        "black",
        "P",
        1,
        9
      ],
      [
        "black",
        "P",
        1,
        8
      ],
      [
        "black",
        "P",
        2,
        9
      ],
      [
        "black",
        "P",
        3,
        9
      ],
      [
        "black",
        "K",
        3,
        1
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮D5 E5",
        "move": {
          "fromX": 3,
          "fromY": 5,
          "toX": 4,
          "toY": 5
        }
      },
      {
        "label": "B",
        "text": "炮E8 E2",
        "move": {
          "fromX": 4,
          "fromY": 2,
          "toX": 4,
          "toY": 8
        }
      },
      {
        "label": "C",
        "text": "帥F3 E3",
        "move": {
          "fromX": 5,
          "fromY": 7,
          "toX": 4,
          "toY": 7
        }
      },
      {
        "label": "D",
        "text": "炮E8 I8",
        "move": {
          "fromX": 4,
          "fromY": 2,
          "toX": 8,
          "toY": 2
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1WvKg6DEWk/"
  },
  {
    "id": "jianghu-011",
    "title": "小鹏展翅",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "H",
        5,
        0
      ],
      [
        "red",
        "C",
        7,
        6
      ],
      [
        "red",
        "C",
        8,
        6
      ],
      [
        "red",
        "R",
        8,
        5
      ],
      [
        "red",
        "R",
        8,
        4
      ],
      [
        "black",
        "R",
        3,
        8
      ],
      [
        "black",
        "K",
        3,
        2
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "C",
        4,
        2
      ],
      [
        "black",
        "P",
        5,
        7
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車I5 D5+",
        "move": {
          "fromX": 8,
          "fromY": 5,
          "toX": 3,
          "toY": 5
        }
      },
      {
        "label": "B",
        "text": "車I6 D6+",
        "move": {
          "fromX": 8,
          "fromY": 4,
          "toX": 3,
          "toY": 4
        }
      },
      {
        "label": "C",
        "text": "炮H4 H8+",
        "move": {
          "fromX": 7,
          "fromY": 6,
          "toX": 7,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "馬F10 x E8",
        "move": {
          "fromX": 5,
          "fromY": 0,
          "toX": 4,
          "toY": 2
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1m1Tf6wE7H/"
  },
  {
    "id": "jianghu-012",
    "title": "乌骏兔走",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        4,
        4
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "C",
        7,
        5
      ],
      [
        "red",
        "R",
        8,
        5
      ],
      [
        "black",
        "R",
        2,
        9
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "H",
        4,
        9
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "R",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮H5 H10+",
        "move": {
          "fromX": 7,
          "fromY": 5,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "炮H5 H1",
        "move": {
          "fromX": 7,
          "fromY": 5,
          "toX": 7,
          "toY": 9
        }
      },
      {
        "label": "C",
        "text": "兵F9 x F10",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 5,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "兵E9 D9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1FKTE6qEK9/"
  },
  {
    "id": "jianghu-013",
    "title": "流星划空",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "R",
        7,
        8
      ],
      [
        "red",
        "C",
        8,
        2
      ],
      [
        "black",
        "R",
        1,
        0
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        5,
        1
      ],
      [
        "black",
        "A",
        5,
        0
      ],
      [
        "black",
        "P",
        6,
        4
      ],
      [
        "black",
        "P",
        8,
        3
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車H2 H9+",
        "move": {
          "fromX": 7,
          "fromY": 8,
          "toX": 7,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "車H2 F2+",
        "move": {
          "fromX": 7,
          "fromY": 8,
          "toX": 5,
          "toY": 8
        }
      },
      {
        "label": "C",
        "text": "炮I8 I9",
        "move": {
          "fromX": 8,
          "fromY": 2,
          "toX": 8,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "炮I8 C8",
        "move": {
          "fromX": 8,
          "fromY": 2,
          "toX": 2,
          "toY": 2
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1wgTV6bESW/"
  },
  {
    "id": "jianghu-014",
    "title": "三星伴月",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "C",
        1,
        2
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "H",
        3,
        2
      ],
      [
        "red",
        "P",
        4,
        3
      ],
      [
        "black",
        "R",
        2,
        5
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "C",
        5,
        9
      ],
      [
        "black",
        "H",
        5,
        7
      ],
      [
        "black",
        "R",
        5,
        3
      ],
      [
        "black",
        "K",
        5,
        2
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵E7 x E8+",
        "move": {
          "fromX": 4,
          "fromY": 3,
          "toX": 4,
          "toY": 2
        }
      },
      {
        "label": "B",
        "text": "兵E7 x F7+",
        "move": {
          "fromX": 4,
          "fromY": 3,
          "toX": 5,
          "toY": 3
        }
      },
      {
        "label": "C",
        "text": "馬D8 B7+",
        "move": {
          "fromX": 3,
          "fromY": 2,
          "toX": 1,
          "toY": 3
        }
      },
      {
        "label": "D",
        "text": "馬D8 E6+",
        "move": {
          "fromX": 3,
          "fromY": 2,
          "toX": 4,
          "toY": 4
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1hJ756qEb6/"
  },
  {
    "id": "jianghu-015",
    "title": "二郎搜山",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "H",
        2,
        1
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "P",
        7,
        0
      ],
      [
        "black",
        "H",
        0,
        1
      ],
      [
        "black",
        "K",
        3,
        2
      ],
      [
        "black",
        "H",
        3,
        1
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "帥F1 E1",
        "move": {
          "fromX": 5,
          "fromY": 9,
          "toX": 4,
          "toY": 9
        }
      },
      {
        "label": "B",
        "text": "兵F9 E9",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "兵H10 G10",
        "move": {
          "fromX": 7,
          "fromY": 0,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "馬C9 D7",
        "move": {
          "fromX": 2,
          "fromY": 1,
          "toX": 3,
          "toY": 3
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1AHjR6vENm/"
  },
  {
    "id": "jianghu-016",
    "title": "巧计渡河",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "H",
        3,
        5
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "C",
        8,
        6
      ],
      [
        "black",
        "P",
        0,
        3
      ],
      [
        "black",
        "P",
        1,
        8
      ],
      [
        "black",
        "A",
        3,
        2
      ],
      [
        "black",
        "K",
        3,
        1
      ],
      [
        "black",
        "H",
        4,
        1
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "A",
        5,
        0
      ],
      [
        "black",
        "P",
        6,
        3
      ],
      [
        "black",
        "C",
        6,
        1
      ],
      [
        "black",
        "P",
        7,
        5
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮I4 I9",
        "move": {
          "fromX": 8,
          "fromY": 6,
          "toX": 8,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "炮I4 D4",
        "move": {
          "fromX": 8,
          "fromY": 6,
          "toX": 3,
          "toY": 6
        }
      },
      {
        "label": "C",
        "text": "馬D5 C7+",
        "move": {
          "fromX": 3,
          "fromY": 5,
          "toX": 2,
          "toY": 3
        }
      },
      {
        "label": "D",
        "text": "馬D5 E7+",
        "move": {
          "fromX": 3,
          "fromY": 5,
          "toX": 4,
          "toY": 3
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1YP7M6WE5Z/"
  },
  {
    "id": "jianghu-017",
    "title": "起步闯堂",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "E",
        0,
        7
      ],
      [
        "red",
        "C",
        0,
        1
      ],
      [
        "red",
        "R",
        3,
        9
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "C",
        8,
        5
      ],
      [
        "red",
        "R",
        8,
        4
      ],
      [
        "black",
        "C",
        0,
        9
      ],
      [
        "black",
        "R",
        2,
        9
      ],
      [
        "black",
        "A",
        3,
        2
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "R",
        4,
        7
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "A",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車I6 E6+",
        "move": {
          "fromX": 8,
          "fromY": 4,
          "toX": 4,
          "toY": 4
        }
      },
      {
        "label": "B",
        "text": "兵F9 x F10+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 5,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "兵F9 E9+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "車I6 F6",
        "move": {
          "fromX": 8,
          "fromY": 4,
          "toX": 5,
          "toY": 4
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1v2j46CE5q/"
  },
  {
    "id": "jianghu-018",
    "title": "射马擒王",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "H",
        3,
        3
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "C",
        4,
        7
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "R",
        5,
        3
      ],
      [
        "red",
        "C",
        6,
        5
      ],
      [
        "red",
        "R",
        6,
        3
      ],
      [
        "black",
        "R",
        0,
        2
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        4,
        3
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "P",
        6,
        8
      ],
      [
        "black",
        "P",
        6,
        4
      ],
      [
        "black",
        "H",
        7,
        2
      ],
      [
        "black",
        "P",
        8,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵D9 x D10+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "兵D9 x E9+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "車F7 F10+",
        "move": {
          "fromX": 5,
          "fromY": 3,
          "toX": 5,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "炮E3 x E8+",
        "move": {
          "fromX": 4,
          "fromY": 7,
          "toX": 4,
          "toY": 2
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1j5jH6cEKX/"
  },
  {
    "id": "jianghu-019",
    "title": "巧取豪夺",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "E",
        0,
        7
      ],
      [
        "red",
        "E",
        2,
        5
      ],
      [
        "red",
        "A",
        3,
        9
      ],
      [
        "red",
        "A",
        3,
        7
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "C",
        4,
        4
      ],
      [
        "red",
        "H",
        4,
        3
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "black",
        "H",
        0,
        2
      ],
      [
        "black",
        "P",
        2,
        3
      ],
      [
        "black",
        "R",
        3,
        5
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        5
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "H",
        6,
        7
      ],
      [
        "black",
        "P",
        6,
        3
      ],
      [
        "black",
        "P",
        8,
        5
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "馬E7 C8+",
        "move": {
          "fromX": 4,
          "fromY": 3,
          "toX": 2,
          "toY": 2
        }
      },
      {
        "label": "B",
        "text": "馬E7 C6+",
        "move": {
          "fromX": 4,
          "fromY": 3,
          "toX": 2,
          "toY": 4
        }
      },
      {
        "label": "C",
        "text": "馬E7 G8+",
        "move": {
          "fromX": 4,
          "fromY": 3,
          "toX": 6,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "馬E7 G6+",
        "move": {
          "fromX": 4,
          "fromY": 3,
          "toX": 6,
          "toY": 4
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1obEY6TEfY/"
  },
  {
    "id": "jianghu-020",
    "title": "翻蹄亮掌",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "R",
        8,
        5
      ],
      [
        "red",
        "C",
        8,
        3
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "H",
        4,
        8
      ],
      [
        "black",
        "R",
        6,
        0
      ],
      [
        "black",
        "C",
        7,
        5
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮I7 I10+",
        "move": {
          "fromX": 8,
          "fromY": 3,
          "toX": 8,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "炮I7 G7",
        "move": {
          "fromX": 8,
          "fromY": 3,
          "toX": 6,
          "toY": 3
        }
      },
      {
        "label": "C",
        "text": "炮I7 D7",
        "move": {
          "fromX": 8,
          "fromY": 3,
          "toX": 3,
          "toY": 3
        }
      },
      {
        "label": "D",
        "text": "車I5 x H5",
        "move": {
          "fromX": 8,
          "fromY": 5,
          "toX": 7,
          "toY": 5
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1agED6VE2H/"
  },
  {
    "id": "jianghu-021",
    "title": "五出祁山",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "E",
        2,
        9
      ],
      [
        "red",
        "H",
        2,
        3
      ],
      [
        "red",
        "R",
        2,
        2
      ],
      [
        "red",
        "A",
        3,
        7
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "A",
        5,
        9
      ],
      [
        "red",
        "C",
        5,
        4
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "black",
        "C",
        0,
        9
      ],
      [
        "black",
        "E",
        0,
        2
      ],
      [
        "black",
        "R",
        1,
        9
      ],
      [
        "black",
        "E",
        2,
        4
      ],
      [
        "black",
        "R",
        3,
        8
      ],
      [
        "black",
        "K",
        3,
        1
      ],
      [
        "black",
        "P",
        4,
        4
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "A",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車C8 C9+",
        "move": {
          "fromX": 2,
          "fromY": 2,
          "toX": 2,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "車C8 C10+",
        "move": {
          "fromX": 2,
          "fromY": 2,
          "toX": 2,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車C8 B8+",
        "move": {
          "fromX": 2,
          "fromY": 2,
          "toX": 1,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "車C8 E8+",
        "move": {
          "fromX": 2,
          "fromY": 2,
          "toX": 4,
          "toY": 2
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1uAW1zHEzj/"
  },
  {
    "id": "jianghu-022",
    "title": "倒卷珠帘",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "C",
        1,
        1
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        6,
        1
      ],
      [
        "black",
        "P",
        1,
        6
      ],
      [
        "black",
        "P",
        1,
        5
      ],
      [
        "black",
        "H",
        1,
        3
      ],
      [
        "black",
        "H",
        1,
        2
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        5,
        0
      ],
      [
        "black",
        "P",
        7,
        8
      ],
      [
        "black",
        "P",
        8,
        7
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵G9 G10+",
        "move": {
          "fromX": 6,
          "fromY": 1,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "兵G9 F9+",
        "move": {
          "fromX": 6,
          "fromY": 1,
          "toX": 5,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "炮B9 B10+",
        "move": {
          "fromX": 1,
          "fromY": 1,
          "toX": 1,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "炮B9 x B7",
        "move": {
          "fromX": 1,
          "fromY": 1,
          "toX": 1,
          "toY": 3
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1iDWyz8Eem/"
  },
  {
    "id": "jianghu-023",
    "title": "连火阵",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        1,
        0
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "P",
        5,
        2
      ],
      [
        "red",
        "C",
        7,
        8
      ],
      [
        "red",
        "R",
        7,
        7
      ],
      [
        "red",
        "R",
        7,
        6
      ],
      [
        "black",
        "P",
        2,
        7
      ],
      [
        "black",
        "R",
        3,
        9
      ],
      [
        "black",
        "K",
        3,
        2
      ],
      [
        "black",
        "C",
        4,
        9
      ],
      [
        "black",
        "H",
        4,
        8
      ],
      [
        "black",
        "R",
        6,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車H3 D3+",
        "move": {
          "fromX": 7,
          "fromY": 7,
          "toX": 3,
          "toY": 7
        }
      },
      {
        "label": "B",
        "text": "車H4 D4+",
        "move": {
          "fromX": 7,
          "fromY": 6,
          "toX": 3,
          "toY": 6
        }
      },
      {
        "label": "C",
        "text": "兵F8 E8+",
        "move": {
          "fromX": 5,
          "fromY": 2,
          "toX": 4,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "兵E9 D9",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1DaswziEoo/"
  },
  {
    "id": "jianghu-024",
    "title": "羊肠九曲",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "C",
        2,
        9
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "E",
        6,
        9
      ],
      [
        "red",
        "P",
        6,
        1
      ],
      [
        "red",
        "P",
        7,
        2
      ],
      [
        "black",
        "P",
        0,
        3
      ],
      [
        "black",
        "E",
        2,
        0
      ],
      [
        "black",
        "A",
        3,
        2
      ],
      [
        "black",
        "H",
        4,
        1
      ],
      [
        "black",
        "K",
        5,
        2
      ],
      [
        "black",
        "E",
        6,
        4
      ],
      [
        "black",
        "P",
        8,
        5
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮C1 C8+",
        "move": {
          "fromX": 2,
          "fromY": 9,
          "toX": 2,
          "toY": 2
        }
      },
      {
        "label": "B",
        "text": "炮C1 C9",
        "move": {
          "fromX": 2,
          "fromY": 9,
          "toX": 2,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "炮C1 C7",
        "move": {
          "fromX": 2,
          "fromY": 9,
          "toX": 2,
          "toY": 3
        }
      },
      {
        "label": "D",
        "text": "帥E1 E2",
        "move": {
          "fromX": 4,
          "fromY": 9,
          "toX": 4,
          "toY": 8
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1qZ4xzXEo5/"
  },
  {
    "id": "jianghu-025",
    "title": "败走樊城",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "E",
        2,
        9
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "P",
        4,
        6
      ],
      [
        "red",
        "P",
        4,
        3
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "C",
        7,
        7
      ],
      [
        "red",
        "R",
        7,
        2
      ],
      [
        "red",
        "R",
        8,
        2
      ],
      [
        "black",
        "P",
        1,
        8
      ],
      [
        "black",
        "R",
        2,
        8
      ],
      [
        "black",
        "E",
        2,
        4
      ],
      [
        "black",
        "H",
        3,
        1
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車H8 H10+",
        "move": {
          "fromX": 7,
          "fromY": 2,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "車I8 I10+",
        "move": {
          "fromX": 8,
          "fromY": 2,
          "toX": 8,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "炮H3 H2",
        "move": {
          "fromX": 7,
          "fromY": 7,
          "toX": 7,
          "toY": 8
        }
      },
      {
        "label": "D",
        "text": "兵F9 x E9+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1HE4EzMEuJ/"
  },
  {
    "id": "jianghu-026",
    "title": "尽善克忠",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "E",
        0,
        7
      ],
      [
        "red",
        "R",
        3,
        1
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "C",
        4,
        7
      ],
      [
        "red",
        "P",
        4,
        6
      ],
      [
        "red",
        "R",
        5,
        1
      ],
      [
        "red",
        "H",
        6,
        3
      ],
      [
        "red",
        "E",
        8,
        7
      ],
      [
        "red",
        "H",
        8,
        2
      ],
      [
        "black",
        "R",
        2,
        8
      ],
      [
        "black",
        "E",
        2,
        4
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "P",
        3,
        6
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "R",
        6,
        8
      ],
      [
        "black",
        "H",
        6,
        7
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮E3 x E8+",
        "move": {
          "fromX": 4,
          "fromY": 7,
          "toX": 4,
          "toY": 2
        }
      },
      {
        "label": "B",
        "text": "車D9 x E9+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "車F9 x E9+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "車F9 F10+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 5,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1BJxyzBEQL/"
  },
  {
    "id": "jianghu-027",
    "title": "回风动地",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        2,
        6
      ],
      [
        "red",
        "A",
        3,
        9
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "A",
        5,
        9
      ],
      [
        "red",
        "H",
        5,
        2
      ],
      [
        "red",
        "R",
        6,
        4
      ],
      [
        "black",
        "P",
        2,
        8
      ],
      [
        "black",
        "P",
        4,
        5
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "R",
        5,
        8
      ],
      [
        "black",
        "K",
        5,
        0
      ],
      [
        "black",
        "H",
        6,
        0
      ],
      [
        "black",
        "R",
        7,
        9
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵D9 D10",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "兵E9 E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車G6 G9",
        "move": {
          "fromX": 6,
          "fromY": 4,
          "toX": 6,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "車G6 G1",
        "move": {
          "fromX": 6,
          "fromY": 4,
          "toX": 6,
          "toY": 9
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV12PxyzUESB/"
  },
  {
    "id": "jianghu-028",
    "title": "屏藩社稷",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "H",
        0,
        7
      ],
      [
        "red",
        "C",
        1,
        9
      ],
      [
        "red",
        "P",
        1,
        0
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "R",
        4,
        5
      ],
      [
        "red",
        "R",
        4,
        4
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "black",
        "P",
        0,
        5
      ],
      [
        "black",
        "P",
        1,
        5
      ],
      [
        "black",
        "P",
        2,
        7
      ],
      [
        "black",
        "R",
        3,
        8
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "P",
        5,
        7
      ],
      [
        "black",
        "E",
        6,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵B10 C10+",
        "move": {
          "fromX": 1,
          "fromY": 0,
          "toX": 2,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "兵E9 E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車E5 D5+",
        "move": {
          "fromX": 4,
          "fromY": 5,
          "toX": 3,
          "toY": 5
        }
      },
      {
        "label": "D",
        "text": "車E6 D6+",
        "move": {
          "fromX": 4,
          "fromY": 4,
          "toX": 3,
          "toY": 4
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV15WHLzzEzK/"
  },
  {
    "id": "jianghu-029",
    "title": "横越檀溪",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        0,
        1
      ],
      [
        "red",
        "P",
        4,
        6
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "R",
        6,
        4
      ],
      [
        "red",
        "R",
        7,
        4
      ],
      [
        "red",
        "C",
        8,
        5
      ],
      [
        "red",
        "C",
        8,
        4
      ],
      [
        "black",
        "H",
        3,
        2
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "P",
        5,
        7
      ],
      [
        "black",
        "R",
        8,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車H6 H10+",
        "move": {
          "fromX": 7,
          "fromY": 4,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "車G6 G10+",
        "move": {
          "fromX": 6,
          "fromY": 4,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "炮I5 D5+",
        "move": {
          "fromX": 8,
          "fromY": 5,
          "toX": 3,
          "toY": 5
        }
      },
      {
        "label": "D",
        "text": "兵E9 D9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1TtHuzrEG2/"
  },
  {
    "id": "jianghu-030",
    "title": "风雨会中州",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "C",
        2,
        5
      ],
      [
        "red",
        "K",
        3,
        7
      ],
      [
        "red",
        "A",
        5,
        7
      ],
      [
        "red",
        "H",
        6,
        5
      ],
      [
        "black",
        "R",
        0,
        9
      ],
      [
        "black",
        "P",
        0,
        8
      ],
      [
        "black",
        "H",
        1,
        9
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "A",
        5,
        0
      ],
      [
        "black",
        "E",
        6,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "馬G5 E6",
        "move": {
          "fromX": 6,
          "fromY": 5,
          "toX": 4,
          "toY": 4
        }
      },
      {
        "label": "B",
        "text": "馬G5 H7",
        "move": {
          "fromX": 6,
          "fromY": 5,
          "toX": 7,
          "toY": 3
        }
      },
      {
        "label": "C",
        "text": "炮C5 E5",
        "move": {
          "fromX": 2,
          "fromY": 5,
          "toX": 4,
          "toY": 5
        }
      },
      {
        "label": "D",
        "text": "炮C5 C10+",
        "move": {
          "fromX": 2,
          "fromY": 5,
          "toX": 2,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1EeHxzrENb/"
  },
  {
    "id": "jianghu-031",
    "title": "海外孤舟",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "C",
        4,
        2
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "H",
        5,
        2
      ],
      [
        "red",
        "R",
        7,
        6
      ],
      [
        "red",
        "C",
        8,
        6
      ],
      [
        "black",
        "P",
        3,
        9
      ],
      [
        "black",
        "A",
        3,
        2
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "C",
        5,
        8
      ],
      [
        "black",
        "K",
        5,
        0
      ],
      [
        "black",
        "E",
        6,
        4
      ],
      [
        "black",
        "C",
        7,
        0
      ],
      [
        "black",
        "P",
        8,
        8
      ],
      [
        "black",
        "R",
        8,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "馬F8 H9+",
        "move": {
          "fromX": 5,
          "fromY": 2,
          "toX": 7,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "車H4 x H10+",
        "move": {
          "fromX": 7,
          "fromY": 6,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車H4 F4",
        "move": {
          "fromX": 7,
          "fromY": 6,
          "toX": 5,
          "toY": 6
        }
      },
      {
        "label": "D",
        "text": "炮E8 E7",
        "move": {
          "fromX": 4,
          "fromY": 2,
          "toX": 4,
          "toY": 3
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1vgnZzWEBt/"
  },
  {
    "id": "jianghu-032",
    "title": "邪不压正",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "R",
        0,
        1
      ],
      [
        "red",
        "P",
        1,
        1
      ],
      [
        "red",
        "C",
        2,
        3
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "R",
        3,
        7
      ],
      [
        "black",
        "A",
        3,
        2
      ],
      [
        "black",
        "K",
        3,
        1
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "A",
        5,
        0
      ],
      [
        "black",
        "H",
        7,
        0
      ],
      [
        "black",
        "C",
        8,
        2
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵B9 C9+",
        "move": {
          "fromX": 1,
          "fromY": 1,
          "toX": 2,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "炮C7 D7+",
        "move": {
          "fromX": 2,
          "fromY": 3,
          "toX": 3,
          "toY": 3
        }
      },
      {
        "label": "C",
        "text": "兵B9 B10+",
        "move": {
          "fromX": 1,
          "fromY": 1,
          "toX": 1,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "車A9 A10",
        "move": {
          "fromX": 0,
          "fromY": 1,
          "toX": 0,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1MonJzBETs/"
  },
  {
    "id": "jianghu-033",
    "title": "为丛驱雀",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "E",
        0,
        7
      ],
      [
        "red",
        "P",
        0,
        1
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "A",
        5,
        9
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "P",
        6,
        1
      ],
      [
        "red",
        "R",
        7,
        6
      ],
      [
        "red",
        "R",
        7,
        5
      ],
      [
        "black",
        "H",
        0,
        4
      ],
      [
        "black",
        "P",
        2,
        5
      ],
      [
        "black",
        "R",
        3,
        8
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "H",
        4,
        0
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "E",
        6,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵E9 x E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "兵E9 D9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "車H4 D4+",
        "move": {
          "fromX": 7,
          "fromY": 6,
          "toX": 3,
          "toY": 6
        }
      },
      {
        "label": "D",
        "text": "車H5 D5+",
        "move": {
          "fromX": 7,
          "fromY": 5,
          "toX": 3,
          "toY": 5
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1iXJkz1Ejc/"
  },
  {
    "id": "jianghu-034",
    "title": "金甲玉锁",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "H",
        2,
        3
      ],
      [
        "red",
        "H",
        2,
        2
      ],
      [
        "red",
        "P",
        4,
        4
      ],
      [
        "red",
        "K",
        5,
        7
      ],
      [
        "black",
        "K",
        3,
        1
      ],
      [
        "black",
        "H",
        3,
        0
      ],
      [
        "black",
        "R",
        4,
        0
      ],
      [
        "black",
        "A",
        5,
        0
      ],
      [
        "black",
        "E",
        6,
        4
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "馬C8 A9+",
        "move": {
          "fromX": 2,
          "fromY": 2,
          "toX": 0,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "馬C8 B10+",
        "move": {
          "fromX": 2,
          "fromY": 2,
          "toX": 1,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "馬C8 A7+",
        "move": {
          "fromX": 2,
          "fromY": 2,
          "toX": 0,
          "toY": 3
        }
      },
      {
        "label": "D",
        "text": "馬C8 E7+",
        "move": {
          "fromX": 2,
          "fromY": 2,
          "toX": 4,
          "toY": 3
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1s5JCzhERr/"
  },
  {
    "id": "jianghu-035",
    "title": "兔游月窟",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "H",
        6,
        1
      ],
      [
        "red",
        "C",
        7,
        4
      ],
      [
        "black",
        "P",
        2,
        8
      ],
      [
        "black",
        "P",
        3,
        5
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "A",
        5,
        0
      ],
      [
        "black",
        "C",
        8,
        9
      ],
      [
        "black",
        "C",
        8,
        8
      ],
      [
        "black",
        "E",
        8,
        2
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮H6 H10+",
        "move": {
          "fromX": 7,
          "fromY": 4,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "馬G9 F7",
        "move": {
          "fromX": 6,
          "fromY": 1,
          "toX": 5,
          "toY": 3
        }
      },
      {
        "label": "C",
        "text": "炮H6 E6+",
        "move": {
          "fromX": 7,
          "fromY": 4,
          "toX": 4,
          "toY": 4
        }
      },
      {
        "label": "D",
        "text": "炮H6 H9",
        "move": {
          "fromX": 7,
          "fromY": 4,
          "toX": 7,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1ggJozrETV/"
  },
  {
    "id": "jianghu-036",
    "title": "金猫捕鼠",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "R",
        4,
        7
      ],
      [
        "red",
        "P",
        4,
        2
      ],
      [
        "red",
        "E",
        6,
        9
      ],
      [
        "red",
        "P",
        8,
        6
      ],
      [
        "black",
        "P",
        1,
        9
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "P",
        3,
        6
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "P",
        6,
        6
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵E8 D8+",
        "move": {
          "fromX": 4,
          "fromY": 2,
          "toX": 3,
          "toY": 2
        }
      },
      {
        "label": "B",
        "text": "兵E8 E9+",
        "move": {
          "fromX": 4,
          "fromY": 2,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "兵E8 F8+",
        "move": {
          "fromX": 4,
          "fromY": 2,
          "toX": 5,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "車E3 C3",
        "move": {
          "fromX": 4,
          "fromY": 7,
          "toX": 2,
          "toY": 7
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1zapRzbEmc/"
  },
  {
    "id": "jianghu-037",
    "title": "朝阳鸣凤",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "E",
        0,
        7
      ],
      [
        "red",
        "P",
        3,
        3
      ],
      [
        "red",
        "R",
        3,
        1
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "P",
        4,
        6
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "P",
        6,
        6
      ],
      [
        "red",
        "C",
        6,
        2
      ],
      [
        "red",
        "H",
        7,
        3
      ],
      [
        "red",
        "R",
        7,
        2
      ],
      [
        "black",
        "C",
        0,
        8
      ],
      [
        "black",
        "R",
        2,
        7
      ],
      [
        "black",
        "R",
        4,
        8
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "A",
        5,
        0
      ],
      [
        "black",
        "P",
        6,
        3
      ],
      [
        "black",
        "C",
        8,
        4
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車H8 I8",
        "move": {
          "fromX": 7,
          "fromY": 2,
          "toX": 8,
          "toY": 2
        }
      },
      {
        "label": "B",
        "text": "炮G8 G10+",
        "move": {
          "fromX": 6,
          "fromY": 2,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車D9 x E9+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "車D9 D10+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1MopCzCE4J/"
  },
  {
    "id": "jianghu-038",
    "title": "炮轰连甲",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "C",
        1,
        0
      ],
      [
        "red",
        "C",
        4,
        4
      ],
      [
        "red",
        "K",
        5,
        8
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "black",
        "R",
        0,
        0
      ],
      [
        "black",
        "E",
        2,
        4
      ],
      [
        "black",
        "E",
        2,
        0
      ],
      [
        "black",
        "A",
        3,
        2
      ],
      [
        "black",
        "R",
        3,
        0
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "A",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮B10 x D10",
        "move": {
          "fromX": 1,
          "fromY": 0,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "炮B10 B7",
        "move": {
          "fromX": 1,
          "fromY": 0,
          "toX": 1,
          "toY": 3
        }
      },
      {
        "label": "C",
        "text": "炮E6 H6",
        "move": {
          "fromX": 4,
          "fromY": 4,
          "toX": 7,
          "toY": 4
        }
      },
      {
        "label": "D",
        "text": "炮B10 B5",
        "move": {
          "fromX": 1,
          "fromY": 0,
          "toX": 1,
          "toY": 5
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1vZHozxET5/"
  },
  {
    "id": "jianghu-039",
    "title": "卧榻闻蹄",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        1,
        1
      ],
      [
        "red",
        "P",
        2,
        3
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        4,
        5
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "P",
        6,
        1
      ],
      [
        "red",
        "R",
        7,
        9
      ],
      [
        "red",
        "C",
        7,
        8
      ],
      [
        "black",
        "R",
        3,
        8
      ],
      [
        "black",
        "C",
        3,
        2
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "P",
        6,
        7
      ],
      [
        "black",
        "H",
        6,
        6
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮H2 x D2+",
        "move": {
          "fromX": 7,
          "fromY": 8,
          "toX": 3,
          "toY": 8
        }
      },
      {
        "label": "B",
        "text": "兵E9 E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "兵E9 D9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "炮H2 H7",
        "move": {
          "fromX": 7,
          "fromY": 8,
          "toX": 7,
          "toY": 3
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1GJauzVEB1/"
  },
  {
    "id": "jianghu-040",
    "title": "独守孤城",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "R",
        3,
        8
      ],
      [
        "red",
        "P",
        3,
        4
      ],
      [
        "red",
        "P",
        3,
        3
      ],
      [
        "red",
        "P",
        5,
        4
      ],
      [
        "red",
        "P",
        5,
        3
      ],
      [
        "black",
        "P",
        2,
        8
      ],
      [
        "black",
        "A",
        3,
        2
      ],
      [
        "black",
        "K",
        4,
        2
      ],
      [
        "black",
        "C",
        4,
        1
      ],
      [
        "black",
        "H",
        5,
        9
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "A",
        5,
        2
      ],
      [
        "black",
        "C",
        6,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵D7 E7+",
        "move": {
          "fromX": 3,
          "fromY": 3,
          "toX": 4,
          "toY": 3
        }
      },
      {
        "label": "B",
        "text": "兵D7 x D8+",
        "move": {
          "fromX": 3,
          "fromY": 3,
          "toX": 3,
          "toY": 2
        }
      },
      {
        "label": "C",
        "text": "兵F7 E7+",
        "move": {
          "fromX": 5,
          "fromY": 3,
          "toX": 4,
          "toY": 3
        }
      },
      {
        "label": "D",
        "text": "兵F7 x F8+",
        "move": {
          "fromX": 5,
          "fromY": 3,
          "toX": 5,
          "toY": 2
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1gkaJzMEo8/"
  },
  {
    "id": "jianghu-041",
    "title": "居高思危",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "E",
        0,
        7
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "K",
        5,
        8
      ],
      [
        "red",
        "R",
        5,
        5
      ],
      [
        "red",
        "C",
        5,
        4
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "R",
        3,
        2
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "P",
        7,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮F6 D6+",
        "move": {
          "fromX": 5,
          "fromY": 4,
          "toX": 3,
          "toY": 4
        }
      },
      {
        "label": "B",
        "text": "車F5 G5",
        "move": {
          "fromX": 5,
          "fromY": 5,
          "toX": 6,
          "toY": 5
        }
      },
      {
        "label": "C",
        "text": "炮F6 E6",
        "move": {
          "fromX": 5,
          "fromY": 4,
          "toX": 4,
          "toY": 4
        }
      },
      {
        "label": "D",
        "text": "車F5 E5",
        "move": {
          "fromX": 5,
          "fromY": 5,
          "toX": 4,
          "toY": 5
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1aThQztEQD/"
  },
  {
    "id": "jianghu-042",
    "title": "飞轩迎月",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "R",
        0,
        7
      ],
      [
        "red",
        "R",
        0,
        6
      ],
      [
        "red",
        "C",
        1,
        6
      ],
      [
        "red",
        "C",
        2,
        9
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "E",
        8,
        7
      ],
      [
        "red",
        "P",
        8,
        0
      ],
      [
        "black",
        "C",
        1,
        4
      ],
      [
        "black",
        "C",
        1,
        0
      ],
      [
        "black",
        "R",
        2,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "H",
        5,
        9
      ],
      [
        "black",
        "K",
        5,
        0
      ],
      [
        "black",
        "P",
        6,
        9
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮B4 x B10+",
        "move": {
          "fromX": 1,
          "fromY": 6,
          "toX": 1,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "車A3 D3",
        "move": {
          "fromX": 0,
          "fromY": 7,
          "toX": 3,
          "toY": 7
        }
      },
      {
        "label": "C",
        "text": "車A4 A8",
        "move": {
          "fromX": 0,
          "fromY": 6,
          "toX": 0,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "兵I10 H10",
        "move": {
          "fromX": 8,
          "fromY": 0,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV14KeXzfEED/"
  },
  {
    "id": "jianghu-043",
    "title": "二夺魁",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        1,
        0
      ],
      [
        "red",
        "P",
        2,
        2
      ],
      [
        "red",
        "P",
        3,
        2
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "R",
        4,
        7
      ],
      [
        "red",
        "P",
        7,
        2
      ],
      [
        "red",
        "P",
        7,
        0
      ],
      [
        "black",
        "P",
        1,
        9
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "P",
        5,
        7
      ],
      [
        "black",
        "A",
        5,
        2
      ],
      [
        "black",
        "K",
        5,
        0
      ],
      [
        "black",
        "R",
        6,
        2
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵H8 x G8",
        "move": {
          "fromX": 7,
          "fromY": 2,
          "toX": 6,
          "toY": 2
        }
      },
      {
        "label": "B",
        "text": "兵H10 G10+",
        "move": {
          "fromX": 7,
          "fromY": 0,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車E3 E10+",
        "move": {
          "fromX": 4,
          "fromY": 7,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "車E3 x F3",
        "move": {
          "fromX": 4,
          "fromY": 7,
          "toX": 5,
          "toY": 7
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1hWeyz5EWs/"
  },
  {
    "id": "jianghu-044",
    "title": "调虎离山",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "R",
        0,
        0
      ],
      [
        "red",
        "C",
        2,
        0
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "C",
        6,
        0
      ],
      [
        "red",
        "R",
        7,
        5
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "C",
        4,
        2
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "P",
        5,
        7
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車H5 F5",
        "move": {
          "fromX": 7,
          "fromY": 5,
          "toX": 5,
          "toY": 5
        }
      },
      {
        "label": "B",
        "text": "車H5 E5",
        "move": {
          "fromX": 7,
          "fromY": 5,
          "toX": 4,
          "toY": 5
        }
      },
      {
        "label": "C",
        "text": "車H5 H2",
        "move": {
          "fromX": 7,
          "fromY": 5,
          "toX": 7,
          "toY": 8
        }
      },
      {
        "label": "D",
        "text": "炮C10 C2+",
        "move": {
          "fromX": 2,
          "fromY": 0,
          "toX": 2,
          "toY": 8
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1Mbedz6Efp/"
  },
  {
    "id": "jianghu-045",
    "title": "鬼地捉妖",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "H",
        6,
        3
      ],
      [
        "red",
        "H",
        7,
        3
      ],
      [
        "red",
        "P",
        7,
        2
      ],
      [
        "black",
        "R",
        1,
        9
      ],
      [
        "black",
        "H",
        1,
        3
      ],
      [
        "black",
        "H",
        1,
        1
      ],
      [
        "black",
        "P",
        2,
        9
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "R",
        5,
        8
      ],
      [
        "black",
        "K",
        5,
        2
      ],
      [
        "black",
        "C",
        7,
        5
      ],
      [
        "black",
        "C",
        8,
        5
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵H8 G8+",
        "move": {
          "fromX": 7,
          "fromY": 2,
          "toX": 6,
          "toY": 2
        }
      },
      {
        "label": "B",
        "text": "馬G7 H9+",
        "move": {
          "fromX": 6,
          "fromY": 3,
          "toX": 7,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "馬G7 x H5+",
        "move": {
          "fromX": 6,
          "fromY": 3,
          "toX": 7,
          "toY": 5
        }
      },
      {
        "label": "D",
        "text": "馬G7 F5+",
        "move": {
          "fromX": 6,
          "fromY": 3,
          "toX": 5,
          "toY": 5
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1etYyzmE6g/"
  },
  {
    "id": "jianghu-046",
    "title": "五步杀",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "R",
        3,
        1
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "C",
        6,
        5
      ],
      [
        "red",
        "R",
        6,
        2
      ],
      [
        "black",
        "C",
        0,
        9
      ],
      [
        "black",
        "R",
        2,
        8
      ],
      [
        "black",
        "R",
        3,
        8
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        4,
        4
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "A",
        5,
        0
      ],
      [
        "black",
        "H",
        7,
        1
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車D9 D10+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "車D9 x E9+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "兵F9 x F10+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 5,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "兵F9 x E9+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1GmbzzREUK/"
  },
  {
    "id": "jianghu-047",
    "title": "金气秋分",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "R",
        2,
        9
      ],
      [
        "red",
        "R",
        2,
        5
      ],
      [
        "red",
        "C",
        2,
        4
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "P",
        8,
        3
      ],
      [
        "red",
        "P",
        8,
        1
      ],
      [
        "black",
        "P",
        1,
        9
      ],
      [
        "black",
        "R",
        2,
        7
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        4,
        3
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "R",
        5,
        1
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮C6 E6+",
        "move": {
          "fromX": 2,
          "fromY": 4,
          "toX": 4,
          "toY": 4
        }
      },
      {
        "label": "B",
        "text": "車C5 D5",
        "move": {
          "fromX": 2,
          "fromY": 5,
          "toX": 3,
          "toY": 5
        }
      },
      {
        "label": "C",
        "text": "車C5 x C3",
        "move": {
          "fromX": 2,
          "fromY": 5,
          "toX": 2,
          "toY": 7
        }
      },
      {
        "label": "D",
        "text": "車C1 x C3",
        "move": {
          "fromX": 2,
          "fromY": 9,
          "toX": 2,
          "toY": 7
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1Q6bGzyEfB/"
  },
  {
    "id": "jianghu-048",
    "title": "火烧新野",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "K",
        5,
        7
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "E",
        6,
        5
      ],
      [
        "red",
        "P",
        6,
        1
      ],
      [
        "red",
        "C",
        7,
        1
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "R",
        7,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵F9 E9+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "相G5 I3",
        "move": {
          "fromX": 6,
          "fromY": 5,
          "toX": 8,
          "toY": 7
        }
      },
      {
        "label": "C",
        "text": "帥F3 F2",
        "move": {
          "fromX": 5,
          "fromY": 7,
          "toX": 5,
          "toY": 8
        }
      },
      {
        "label": "D",
        "text": "炮H9 I9",
        "move": {
          "fromX": 7,
          "fromY": 1,
          "toX": 8,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1tGthzXE1S/"
  },
  {
    "id": "jianghu-049",
    "title": "秦楚罢兵",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "E",
        2,
        9
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "C",
        4,
        7
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "black",
        "P",
        1,
        9
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "P",
        5,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵D9 E9+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "兵F9 E9+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "相C1 A3",
        "move": {
          "fromX": 2,
          "fromY": 9,
          "toX": 0,
          "toY": 7
        }
      },
      {
        "label": "D",
        "text": "炮E3 E9",
        "move": {
          "fromX": 4,
          "fromY": 7,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1LGtjz4E4Q/"
  },
  {
    "id": "jianghu-050",
    "title": "隔壁猜枚",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "C",
        6,
        6
      ],
      [
        "red",
        "C",
        7,
        6
      ],
      [
        "red",
        "E",
        8,
        7
      ],
      [
        "red",
        "R",
        8,
        6
      ],
      [
        "black",
        "P",
        2,
        8
      ],
      [
        "black",
        "P",
        3,
        6
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "R",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車I4 I5",
        "move": {
          "fromX": 8,
          "fromY": 6,
          "toX": 8,
          "toY": 5
        }
      },
      {
        "label": "B",
        "text": "炮G4 G10+",
        "move": {
          "fromX": 6,
          "fromY": 6,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "炮H4 H10+",
        "move": {
          "fromX": 7,
          "fromY": 6,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "兵E9 D9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1CTt3zsE2n/"
  },
  {
    "id": "jianghu-051",
    "title": "送子学艺",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "C",
        1,
        9
      ],
      [
        "red",
        "P",
        2,
        3
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "black",
        "P",
        0,
        8
      ],
      [
        "black",
        "A",
        3,
        2
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "P",
        8,
        8
      ],
      [
        "black",
        "H",
        8,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮B1 D1+",
        "move": {
          "fromX": 1,
          "fromY": 9,
          "toX": 3,
          "toY": 9
        }
      },
      {
        "label": "B",
        "text": "帥E1 D1",
        "move": {
          "fromX": 4,
          "fromY": 9,
          "toX": 3,
          "toY": 9
        }
      },
      {
        "label": "C",
        "text": "兵C7 C8",
        "move": {
          "fromX": 2,
          "fromY": 3,
          "toX": 2,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "兵F9 x E9",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1wDbSzeE3Y/"
  },
  {
    "id": "jianghu-052",
    "title": "五桂联芳",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        0,
        5
      ],
      [
        "red",
        "P",
        1,
        1
      ],
      [
        "red",
        "E",
        2,
        9
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "R",
        4,
        5
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "black",
        "P",
        1,
        9
      ],
      [
        "black",
        "P",
        3,
        6
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "C",
        6,
        7
      ],
      [
        "black",
        "R",
        6,
        0
      ],
      [
        "black",
        "P",
        8,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車E5 D5+",
        "move": {
          "fromX": 4,
          "fromY": 5,
          "toX": 3,
          "toY": 5
        }
      },
      {
        "label": "B",
        "text": "兵F9 E9",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "車E5 E9",
        "move": {
          "fromX": 4,
          "fromY": 5,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "兵B9 C9",
        "move": {
          "fromX": 1,
          "fromY": 1,
          "toX": 2,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1HDbSzYENY/"
  },
  {
    "id": "jianghu-053",
    "title": "清兵入关",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        2,
        4
      ],
      [
        "red",
        "H",
        4,
        5
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "K",
        5,
        8
      ],
      [
        "red",
        "C",
        7,
        9
      ],
      [
        "red",
        "R",
        8,
        9
      ],
      [
        "black",
        "C",
        2,
        2
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "P",
        5,
        6
      ],
      [
        "black",
        "R",
        5,
        0
      ],
      [
        "black",
        "P",
        6,
        3
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮H1 H10+",
        "move": {
          "fromX": 7,
          "fromY": 9,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "車I1 I3",
        "move": {
          "fromX": 8,
          "fromY": 9,
          "toX": 8,
          "toY": 7
        }
      },
      {
        "label": "C",
        "text": "炮H1 D1",
        "move": {
          "fromX": 7,
          "fromY": 9,
          "toX": 3,
          "toY": 9
        }
      },
      {
        "label": "D",
        "text": "炮H1 F1",
        "move": {
          "fromX": 7,
          "fromY": 9,
          "toX": 5,
          "toY": 9
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1VzgJz9EUS/"
  },
  {
    "id": "jianghu-054",
    "title": "四寇擒王",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "K",
        5,
        7
      ],
      [
        "red",
        "P",
        6,
        4
      ],
      [
        "red",
        "P",
        6,
        3
      ],
      [
        "red",
        "P",
        6,
        2
      ],
      [
        "red",
        "C",
        7,
        9
      ],
      [
        "red",
        "R",
        8,
        9
      ],
      [
        "black",
        "C",
        1,
        7
      ],
      [
        "black",
        "P",
        2,
        7
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        5,
        5
      ],
      [
        "black",
        "C",
        6,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮H1 H10+",
        "move": {
          "fromX": 7,
          "fromY": 9,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "車I1 I4",
        "move": {
          "fromX": 8,
          "fromY": 9,
          "toX": 8,
          "toY": 6
        }
      },
      {
        "label": "C",
        "text": "兵E9 D9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "炮H1 F1",
        "move": {
          "fromX": 7,
          "fromY": 9,
          "toX": 5,
          "toY": 9
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1FTgXzRE7a/"
  },
  {
    "id": "jianghu-055",
    "title": "智斗二虎",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "A",
        3,
        7
      ],
      [
        "red",
        "H",
        4,
        8
      ],
      [
        "red",
        "A",
        5,
        7
      ],
      [
        "red",
        "R",
        7,
        9
      ],
      [
        "red",
        "R",
        7,
        5
      ],
      [
        "black",
        "C",
        0,
        8
      ],
      [
        "black",
        "P",
        1,
        9
      ],
      [
        "black",
        "C",
        1,
        6
      ],
      [
        "black",
        "P",
        2,
        8
      ],
      [
        "black",
        "K",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車H5 H10+",
        "move": {
          "fromX": 7,
          "fromY": 5,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "車H5 F5+",
        "move": {
          "fromX": 7,
          "fromY": 5,
          "toX": 5,
          "toY": 5
        }
      },
      {
        "label": "C",
        "text": "車H5 A5",
        "move": {
          "fromX": 7,
          "fromY": 5,
          "toX": 0,
          "toY": 5
        }
      },
      {
        "label": "D",
        "text": "車H5 B5",
        "move": {
          "fromX": 7,
          "fromY": 5,
          "toX": 1,
          "toY": 5
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV13oM1znETM/"
  },
  {
    "id": "jianghu-056",
    "title": "增兵减灶",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "E",
        2,
        9
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "P",
        4,
        2
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "R",
        7,
        4
      ],
      [
        "red",
        "R",
        7,
        3
      ],
      [
        "black",
        "C",
        1,
        7
      ],
      [
        "black",
        "H",
        1,
        3
      ],
      [
        "black",
        "P",
        2,
        8
      ],
      [
        "black",
        "R",
        3,
        8
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "E",
        6,
        0
      ],
      [
        "black",
        "E",
        8,
        2
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵E9 E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "兵E9 D9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "車H6 D6+",
        "move": {
          "fromX": 7,
          "fromY": 4,
          "toX": 3,
          "toY": 4
        }
      },
      {
        "label": "D",
        "text": "車H7 D7+",
        "move": {
          "fromX": 7,
          "fromY": 3,
          "toX": 3,
          "toY": 3
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1scMMzPEAu/"
  },
  {
    "id": "jianghu-057",
    "title": "螳臂挡車",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "C",
        3,
        9
      ],
      [
        "red",
        "C",
        3,
        1
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "R",
        5,
        9
      ],
      [
        "red",
        "H",
        5,
        2
      ],
      [
        "red",
        "P",
        6,
        1
      ],
      [
        "black",
        "C",
        2,
        2
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "C",
        4,
        1
      ],
      [
        "black",
        "K",
        5,
        0
      ],
      [
        "black",
        "R",
        6,
        8
      ],
      [
        "black",
        "R",
        8,
        1
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "馬F8 G10+",
        "move": {
          "fromX": 5,
          "fromY": 2,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "馬F8 H9+",
        "move": {
          "fromX": 5,
          "fromY": 2,
          "toX": 7,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "馬F8 G6+",
        "move": {
          "fromX": 5,
          "fromY": 2,
          "toX": 6,
          "toY": 4
        }
      },
      {
        "label": "D",
        "text": "馬F8 D7+",
        "move": {
          "fromX": 5,
          "fromY": 2,
          "toX": 3,
          "toY": 3
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV19dTrzrE3y/"
  },
  {
    "id": "jianghu-058",
    "title": "乘风破浪",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "C",
        6,
        6
      ],
      [
        "red",
        "C",
        7,
        6
      ],
      [
        "red",
        "E",
        8,
        7
      ],
      [
        "red",
        "R",
        8,
        6
      ],
      [
        "black",
        "P",
        2,
        8
      ],
      [
        "black",
        "E",
        2,
        4
      ],
      [
        "black",
        "P",
        3,
        6
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        5
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "R",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮G4 G10+",
        "move": {
          "fromX": 6,
          "fromY": 6,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "炮H4 H10+",
        "move": {
          "fromX": 7,
          "fromY": 6,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "炮H4 x D4",
        "move": {
          "fromX": 7,
          "fromY": 6,
          "toX": 3,
          "toY": 6
        }
      },
      {
        "label": "D",
        "text": "車I4 I6",
        "move": {
          "fromX": 8,
          "fromY": 6,
          "toX": 8,
          "toY": 4
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1TkTLzxEBk/"
  },
  {
    "id": "jianghu-059",
    "title": "隔岸观火",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        6,
        6
      ],
      [
        "red",
        "P",
        6,
        2
      ],
      [
        "red",
        "H",
        6,
        1
      ],
      [
        "black",
        "K",
        5,
        1
      ],
      [
        "black",
        "H",
        5,
        0
      ],
      [
        "black",
        "P",
        6,
        4
      ],
      [
        "black",
        "E",
        6,
        0
      ],
      [
        "black",
        "E",
        8,
        2
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵G8 F8+",
        "move": {
          "fromX": 6,
          "fromY": 2,
          "toX": 5,
          "toY": 2
        }
      },
      {
        "label": "B",
        "text": "馬G9 I10",
        "move": {
          "fromX": 6,
          "fromY": 1,
          "toX": 8,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "兵G8 H8",
        "move": {
          "fromX": 6,
          "fromY": 2,
          "toX": 7,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "兵G4 G5",
        "move": {
          "fromX": 6,
          "fromY": 6,
          "toX": 6,
          "toY": 5
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1PG7LzGEKC/"
  },
  {
    "id": "jianghu-060",
    "title": "神兵天降",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        2,
        1
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "P",
        6,
        3
      ],
      [
        "red",
        "R",
        7,
        9
      ],
      [
        "red",
        "C",
        7,
        8
      ],
      [
        "red",
        "C",
        7,
        7
      ],
      [
        "red",
        "P",
        8,
        1
      ],
      [
        "black",
        "P",
        2,
        8
      ],
      [
        "black",
        "E",
        2,
        4
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "P",
        4,
        4
      ],
      [
        "black",
        "R",
        5,
        2
      ],
      [
        "black",
        "K",
        5,
        0
      ],
      [
        "black",
        "C",
        8,
        2
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮H3 F3+",
        "move": {
          "fromX": 7,
          "fromY": 7,
          "toX": 5,
          "toY": 7
        }
      },
      {
        "label": "B",
        "text": "炮H3 E3",
        "move": {
          "fromX": 7,
          "fromY": 7,
          "toX": 4,
          "toY": 7
        }
      },
      {
        "label": "C",
        "text": "炮H3 D3",
        "move": {
          "fromX": 7,
          "fromY": 7,
          "toX": 3,
          "toY": 7
        }
      },
      {
        "label": "D",
        "text": "炮H2 x C2",
        "move": {
          "fromX": 7,
          "fromY": 8,
          "toX": 2,
          "toY": 8
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1ZZjjzvEBA/"
  },
  {
    "id": "jianghu-061",
    "title": "瑚琏之具",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "E",
        2,
        9
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "C",
        6,
        1
      ],
      [
        "red",
        "R",
        7,
        3
      ],
      [
        "red",
        "C",
        8,
        1
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        4,
        4
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "R",
        5,
        4
      ],
      [
        "black",
        "C",
        5,
        2
      ],
      [
        "black",
        "A",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車H7 E7+",
        "move": {
          "fromX": 7,
          "fromY": 3,
          "toX": 4,
          "toY": 3
        }
      },
      {
        "label": "B",
        "text": "車H7 H1",
        "move": {
          "fromX": 7,
          "fromY": 3,
          "toX": 7,
          "toY": 9
        }
      },
      {
        "label": "C",
        "text": "炮G9 G10+",
        "move": {
          "fromX": 6,
          "fromY": 1,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "炮I9 I10+",
        "move": {
          "fromX": 8,
          "fromY": 1,
          "toX": 8,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1f7j8zgEzH/"
  },
  {
    "id": "jianghu-062",
    "title": "七子花开",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "H",
        3,
        7
      ],
      [
        "red",
        "C",
        4,
        7
      ],
      [
        "red",
        "H",
        4,
        2
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "C",
        7,
        3
      ],
      [
        "red",
        "R",
        8,
        3
      ],
      [
        "black",
        "H",
        3,
        9
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "P",
        3,
        6
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "R",
        4,
        6
      ],
      [
        "black",
        "R",
        6,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮H7 H10+",
        "move": {
          "fromX": 7,
          "fromY": 3,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "兵E9 E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "兵E9 D9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "車I7 I1",
        "move": {
          "fromX": 8,
          "fromY": 3,
          "toX": 8,
          "toY": 9
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1xjKjeZEF2/"
  },
  {
    "id": "jianghu-063",
    "title": "霹雳炮",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "E",
        2,
        9
      ],
      [
        "red",
        "H",
        2,
        1
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "C",
        5,
        5
      ],
      [
        "red",
        "R",
        7,
        9
      ],
      [
        "red",
        "C",
        7,
        7
      ],
      [
        "red",
        "R",
        8,
        9
      ],
      [
        "black",
        "C",
        1,
        0
      ],
      [
        "black",
        "P",
        1,
        5
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "C",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "R",
        4,
        2
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "K",
        5,
        0
      ],
      [
        "black",
        "P",
        6,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵E9 E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "兵E9 F9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 5,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "炮H3 F3+",
        "move": {
          "fromX": 7,
          "fromY": 7,
          "toX": 5,
          "toY": 7
        }
      },
      {
        "label": "D",
        "text": "車I1 I10+",
        "move": {
          "fromX": 8,
          "fromY": 9,
          "toX": 8,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1RANvexEKU/"
  },
  {
    "id": "jianghu-064",
    "title": "空股传声",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "P",
        4,
        5
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "R",
        7,
        9
      ],
      [
        "red",
        "C",
        7,
        5
      ],
      [
        "red",
        "R",
        8,
        9
      ],
      [
        "red",
        "C",
        8,
        5
      ],
      [
        "black",
        "C",
        0,
        6
      ],
      [
        "black",
        "C",
        1,
        5
      ],
      [
        "black",
        "P",
        3,
        7
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        4
      ],
      [
        "black",
        "R",
        5,
        0
      ],
      [
        "black",
        "P",
        6,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮H5 H10+",
        "move": {
          "fromX": 7,
          "fromY": 5,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "炮I5 I10+",
        "move": {
          "fromX": 8,
          "fromY": 5,
          "toX": 8,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車H1 H4",
        "move": {
          "fromX": 7,
          "fromY": 9,
          "toX": 7,
          "toY": 6
        }
      },
      {
        "label": "D",
        "text": "車H1 F1",
        "move": {
          "fromX": 7,
          "fromY": 9,
          "toX": 5,
          "toY": 9
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1WfNheaEzW/"
  },
  {
    "id": "jianghu-065",
    "title": "的卢越溪",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "A",
        3,
        9
      ],
      [
        "red",
        "A",
        3,
        7
      ],
      [
        "red",
        "K",
        4,
        8
      ],
      [
        "red",
        "H",
        4,
        7
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "H",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "A",
        5,
        0
      ],
      [
        "black",
        "P",
        6,
        8
      ],
      [
        "black",
        "H",
        8,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "馬E3 D5",
        "move": {
          "fromX": 4,
          "fromY": 7,
          "toX": 3,
          "toY": 5
        }
      },
      {
        "label": "B",
        "text": "馬E3 F5",
        "move": {
          "fromX": 4,
          "fromY": 7,
          "toX": 5,
          "toY": 5
        }
      },
      {
        "label": "C",
        "text": "馬E3 G4",
        "move": {
          "fromX": 4,
          "fromY": 7,
          "toX": 6,
          "toY": 6
        }
      },
      {
        "label": "D",
        "text": "馬E3 x G2",
        "move": {
          "fromX": 4,
          "fromY": 7,
          "toX": 6,
          "toY": 8
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1MdNderE3z/"
  },
  {
    "id": "jianghu-066",
    "title": "黄龙斗宝",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "E",
        6,
        5
      ],
      [
        "red",
        "R",
        7,
        9
      ],
      [
        "red",
        "R",
        8,
        7
      ],
      [
        "red",
        "C",
        8,
        6
      ],
      [
        "black",
        "C",
        2,
        0
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "P",
        3,
        7
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "R",
        5,
        5
      ],
      [
        "black",
        "K",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮I4 F4+",
        "move": {
          "fromX": 8,
          "fromY": 6,
          "toX": 5,
          "toY": 6
        }
      },
      {
        "label": "B",
        "text": "車H1 H10+",
        "move": {
          "fromX": 7,
          "fromY": 9,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "兵E9 E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "兵E9 F9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 5,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1oNfRYNEzg/"
  },
  {
    "id": "jianghu-067",
    "title": "五子登科",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "C",
        0,
        4
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "P",
        5,
        0
      ],
      [
        "black",
        "P",
        2,
        8
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "P",
        5,
        7
      ],
      [
        "black",
        "H",
        5,
        2
      ],
      [
        "black",
        "P",
        6,
        8
      ],
      [
        "black",
        "P",
        7,
        9
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮A6 F6",
        "move": {
          "fromX": 0,
          "fromY": 4,
          "toX": 5,
          "toY": 4
        }
      },
      {
        "label": "B",
        "text": "炮A6 G6",
        "move": {
          "fromX": 0,
          "fromY": 4,
          "toX": 6,
          "toY": 4
        }
      },
      {
        "label": "C",
        "text": "炮A6 H6",
        "move": {
          "fromX": 0,
          "fromY": 4,
          "toX": 7,
          "toY": 4
        }
      },
      {
        "label": "D",
        "text": "炮A6 I6",
        "move": {
          "fromX": 0,
          "fromY": 4,
          "toX": 8,
          "toY": 4
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1ndfJYVEgU/"
  },
  {
    "id": "jianghu-068",
    "title": "斜月三星",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        3,
        7
      ],
      [
        "red",
        "P",
        3,
        2
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "P",
        4,
        2
      ],
      [
        "red",
        "R",
        4,
        1
      ],
      [
        "red",
        "A",
        5,
        7
      ],
      [
        "black",
        "H",
        2,
        6
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "K",
        5,
        0
      ],
      [
        "black",
        "C",
        8,
        9
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵D9 D10",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "兵E8 F8",
        "move": {
          "fromX": 4,
          "fromY": 2,
          "toX": 5,
          "toY": 2
        }
      },
      {
        "label": "C",
        "text": "仕F3 E2",
        "move": {
          "fromX": 5,
          "fromY": 7,
          "toX": 4,
          "toY": 8
        }
      },
      {
        "label": "D",
        "text": "車E9 F9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 5,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1GRw8evE4F/"
  },
  {
    "id": "jianghu-069",
    "title": "红梅迎春",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "P",
        3,
        2
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "E",
        6,
        9
      ],
      [
        "red",
        "R",
        7,
        5
      ],
      [
        "red",
        "C",
        7,
        4
      ],
      [
        "red",
        "C",
        7,
        3
      ],
      [
        "black",
        "C",
        3,
        5
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "R",
        5,
        2
      ],
      [
        "black",
        "K",
        5,
        0
      ],
      [
        "black",
        "P",
        7,
        9
      ],
      [
        "black",
        "E",
        8,
        2
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮H7 F7+",
        "move": {
          "fromX": 7,
          "fromY": 3,
          "toX": 5,
          "toY": 3
        }
      },
      {
        "label": "B",
        "text": "炮H6 x H1",
        "move": {
          "fromX": 7,
          "fromY": 4,
          "toX": 7,
          "toY": 9
        }
      },
      {
        "label": "C",
        "text": "炮H6 F6+",
        "move": {
          "fromX": 7,
          "fromY": 4,
          "toX": 5,
          "toY": 4
        }
      },
      {
        "label": "D",
        "text": "兵E9 E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1KnwUerEcV/"
  },
  {
    "id": "jianghu-070",
    "title": "猛虎入山",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "C",
        1,
        4
      ],
      [
        "red",
        "H",
        2,
        3
      ],
      [
        "red",
        "R",
        3,
        5
      ],
      [
        "red",
        "K",
        4,
        7
      ],
      [
        "red",
        "R",
        4,
        6
      ],
      [
        "black",
        "H",
        2,
        9
      ],
      [
        "black",
        "E",
        2,
        0
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "R",
        5,
        9
      ],
      [
        "black",
        "R",
        5,
        8
      ],
      [
        "black",
        "C",
        5,
        0
      ],
      [
        "black",
        "E",
        6,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮B6 E6+",
        "move": {
          "fromX": 1,
          "fromY": 4,
          "toX": 4,
          "toY": 4
        }
      },
      {
        "label": "B",
        "text": "車D5 x D10+",
        "move": {
          "fromX": 3,
          "fromY": 5,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車E4 x E9+",
        "move": {
          "fromX": 4,
          "fromY": 6,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "炮B6 B1",
        "move": {
          "fromX": 1,
          "fromY": 4,
          "toX": 1,
          "toY": 9
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1aywGeEELb/"
  },
  {
    "id": "jianghu-071",
    "title": "围魏救赵",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "P",
        2,
        6
      ],
      [
        "red",
        "P",
        2,
        0
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "C",
        3,
        6
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "P",
        6,
        1
      ],
      [
        "black",
        "P",
        1,
        8
      ],
      [
        "black",
        "R",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵C10 x D10+",
        "move": {
          "fromX": 2,
          "fromY": 0,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "兵D9 x D10+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "兵D9 x E9+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "炮D4 E4+",
        "move": {
          "fromX": 3,
          "fromY": 6,
          "toX": 4,
          "toY": 6
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1Kmc1eaEuY/"
  },
  {
    "id": "jianghu-072",
    "title": "双炮雄风",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "C",
        4,
        1
      ],
      [
        "red",
        "C",
        8,
        0
      ],
      [
        "black",
        "H",
        3,
        1
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "H",
        4,
        0
      ],
      [
        "black",
        "C",
        7,
        0
      ],
      [
        "black",
        "P",
        8,
        3
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮E9 F9",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 5,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "炮E9 G9",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 6,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "炮E9 H9",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 7,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "炮E9 I9",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 8,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV12krYYmEqB/"
  },
  {
    "id": "jianghu-073",
    "title": "攀猿叩马",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "H",
        1,
        3
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "H",
        4,
        5
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "A",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "馬B7 C9",
        "move": {
          "fromX": 1,
          "fromY": 3,
          "toX": 2,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "馬B7 D8",
        "move": {
          "fromX": 1,
          "fromY": 3,
          "toX": 3,
          "toY": 2
        }
      },
      {
        "label": "C",
        "text": "馬B7 D6",
        "move": {
          "fromX": 1,
          "fromY": 3,
          "toX": 3,
          "toY": 4
        }
      },
      {
        "label": "D",
        "text": "馬B7 A9",
        "move": {
          "fromX": 1,
          "fromY": 3,
          "toX": 0,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1ENrmYgEZZ/"
  },
  {
    "id": "jianghu-074",
    "title": "五迷三道",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "C",
        1,
        5
      ],
      [
        "red",
        "R",
        1,
        3
      ],
      [
        "red",
        "P",
        2,
        1
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "black",
        "C",
        3,
        2
      ],
      [
        "black",
        "H",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "H",
        4,
        5
      ],
      [
        "black",
        "K",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車B7 F7+",
        "move": {
          "fromX": 1,
          "fromY": 3,
          "toX": 5,
          "toY": 3
        }
      },
      {
        "label": "B",
        "text": "車B7 B10",
        "move": {
          "fromX": 1,
          "fromY": 3,
          "toX": 1,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "炮B5 A5",
        "move": {
          "fromX": 1,
          "fromY": 5,
          "toX": 0,
          "toY": 5
        }
      },
      {
        "label": "D",
        "text": "炮B5 B2",
        "move": {
          "fromX": 1,
          "fromY": 5,
          "toX": 1,
          "toY": 8
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV11QrAYFEzT/"
  },
  {
    "id": "jianghu-075",
    "title": "食鲑防毒",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "A",
        3,
        9
      ],
      [
        "red",
        "K",
        3,
        7
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "P",
        6,
        1
      ],
      [
        "red",
        "C",
        8,
        6
      ],
      [
        "red",
        "R",
        8,
        5
      ],
      [
        "red",
        "R",
        8,
        4
      ],
      [
        "black",
        "R",
        4,
        8
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "P",
        5,
        7
      ],
      [
        "black",
        "E",
        6,
        0
      ],
      [
        "black",
        "C",
        8,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "仕D1 x E2",
        "move": {
          "fromX": 3,
          "fromY": 9,
          "toX": 4,
          "toY": 8
        }
      },
      {
        "label": "B",
        "text": "車I5 E5+",
        "move": {
          "fromX": 8,
          "fromY": 5,
          "toX": 4,
          "toY": 5
        }
      },
      {
        "label": "C",
        "text": "車I6 E6+",
        "move": {
          "fromX": 8,
          "fromY": 4,
          "toX": 4,
          "toY": 4
        }
      },
      {
        "label": "D",
        "text": "兵D9 D10+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1Gn6uYQEec/"
  },
  {
    "id": "jianghu-076",
    "title": "九尾龟宗旺",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "H",
        1,
        4
      ],
      [
        "red",
        "R",
        1,
        0
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "C",
        8,
        6
      ],
      [
        "black",
        "R",
        1,
        9
      ],
      [
        "black",
        "P",
        2,
        5
      ],
      [
        "black",
        "H",
        2,
        0
      ],
      [
        "black",
        "C",
        3,
        9
      ],
      [
        "black",
        "R",
        5,
        8
      ],
      [
        "black",
        "K",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車B10 x C10+",
        "move": {
          "fromX": 1,
          "fromY": 0,
          "toX": 2,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "兵E9 E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "兵E9 F9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 5,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "馬B6 C8",
        "move": {
          "fromX": 1,
          "fromY": 4,
          "toX": 2,
          "toY": 2
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV11EChYVE2p/"
  },
  {
    "id": "jianghu-077",
    "title": "七子连吟",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "R",
        4,
        1
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "P",
        5,
        4
      ],
      [
        "red",
        "E",
        6,
        5
      ],
      [
        "red",
        "R",
        6,
        3
      ],
      [
        "red",
        "C",
        7,
        3
      ],
      [
        "red",
        "C",
        8,
        2
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "P",
        7,
        8
      ],
      [
        "black",
        "C",
        8,
        3
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮H7 H10",
        "move": {
          "fromX": 7,
          "fromY": 3,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "炮I8 I10",
        "move": {
          "fromX": 8,
          "fromY": 2,
          "toX": 8,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車G7 G10+",
        "move": {
          "fromX": 6,
          "fromY": 3,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "車G7 D7+",
        "move": {
          "fromX": 6,
          "fromY": 3,
          "toX": 3,
          "toY": 3
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV163CnYMEJP/"
  },
  {
    "id": "jianghu-078",
    "title": "惊涛险浪",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "H",
        1,
        3
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "R",
        6,
        9
      ],
      [
        "red",
        "R",
        6,
        1
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "R",
        5,
        7
      ],
      [
        "black",
        "R",
        5,
        2
      ],
      [
        "black",
        "C",
        5,
        1
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車G9 x F9",
        "move": {
          "fromX": 6,
          "fromY": 1,
          "toX": 5,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "馬B7 C9+",
        "move": {
          "fromX": 1,
          "fromY": 3,
          "toX": 2,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "馬B7 D8+",
        "move": {
          "fromX": 1,
          "fromY": 3,
          "toX": 3,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "車G9 G10+",
        "move": {
          "fromX": 6,
          "fromY": 1,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV18wCPYgELi/"
  },
  {
    "id": "jianghu-079",
    "title": "宋楚私成",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "E",
        0,
        7
      ],
      [
        "red",
        "P",
        2,
        1
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "E",
        6,
        5
      ],
      [
        "red",
        "P",
        6,
        1
      ],
      [
        "red",
        "R",
        7,
        8
      ],
      [
        "red",
        "C",
        8,
        0
      ],
      [
        "black",
        "P",
        0,
        3
      ],
      [
        "black",
        "P",
        2,
        4
      ],
      [
        "black",
        "H",
        3,
        8
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "R",
        4,
        8
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "P",
        6,
        8
      ],
      [
        "black",
        "E",
        8,
        2
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵G9 G10+",
        "move": {
          "fromX": 6,
          "fromY": 1,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "車H2 H10+",
        "move": {
          "fromX": 7,
          "fromY": 8,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "兵C9 C10+",
        "move": {
          "fromX": 2,
          "fromY": 1,
          "toX": 2,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "兵C9 D9+",
        "move": {
          "fromX": 2,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1RuCAY1EMB/"
  },
  {
    "id": "jianghu-080",
    "title": "江湖小鹏",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "H",
        1,
        0
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "A",
        5,
        9
      ],
      [
        "red",
        "C",
        5,
        7
      ],
      [
        "red",
        "C",
        6,
        7
      ],
      [
        "red",
        "R",
        6,
        6
      ],
      [
        "red",
        "R",
        6,
        5
      ],
      [
        "black",
        "R",
        3,
        8
      ],
      [
        "black",
        "K",
        3,
        2
      ],
      [
        "black",
        "C",
        3,
        1
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "P",
        5,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車G4 D4+",
        "move": {
          "fromX": 6,
          "fromY": 6,
          "toX": 3,
          "toY": 6
        }
      },
      {
        "label": "B",
        "text": "車G5 D5+",
        "move": {
          "fromX": 6,
          "fromY": 5,
          "toX": 3,
          "toY": 5
        }
      },
      {
        "label": "C",
        "text": "炮F3 D3",
        "move": {
          "fromX": 5,
          "fromY": 7,
          "toX": 3,
          "toY": 7
        }
      },
      {
        "label": "D",
        "text": "炮F3 F8+",
        "move": {
          "fromX": 5,
          "fromY": 7,
          "toX": 5,
          "toY": 2
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1S6qhYqEVH/"
  },
  {
    "id": "jianghu-081",
    "title": "力穿七札",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "C",
        3,
        7
      ],
      [
        "red",
        "R",
        3,
        1
      ],
      [
        "red",
        "H",
        5,
        3
      ],
      [
        "red",
        "R",
        5,
        1
      ],
      [
        "red",
        "H",
        7,
        4
      ],
      [
        "red",
        "C",
        8,
        0
      ],
      [
        "black",
        "C",
        1,
        3
      ],
      [
        "black",
        "R",
        2,
        8
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "R",
        5,
        8
      ],
      [
        "black",
        "H",
        5,
        4
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車D9 x D10+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "車D9 x E9+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "車F9 F10+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 5,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "車F9 x E9+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1HwzAY2EFh/"
  },
  {
    "id": "jianghu-082",
    "title": "玉麟翻波",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "R",
        6,
        9
      ],
      [
        "red",
        "C",
        6,
        5
      ],
      [
        "red",
        "R",
        8,
        9
      ],
      [
        "red",
        "C",
        8,
        5
      ],
      [
        "black",
        "P",
        2,
        8
      ],
      [
        "black",
        "C",
        2,
        6
      ],
      [
        "black",
        "P",
        3,
        7
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "R",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮G5 G10+",
        "move": {
          "fromX": 6,
          "fromY": 5,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "炮I5 I10+",
        "move": {
          "fromX": 8,
          "fromY": 5,
          "toX": 8,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車G1 G4",
        "move": {
          "fromX": 6,
          "fromY": 9,
          "toX": 6,
          "toY": 6
        }
      },
      {
        "label": "D",
        "text": "車I1 I2",
        "move": {
          "fromX": 8,
          "fromY": 9,
          "toX": 8,
          "toY": 8
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV118UmYBE97/"
  },
  {
    "id": "jianghu-083",
    "title": "二顾草庐",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "E",
        0,
        7
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "R",
        6,
        2
      ],
      [
        "red",
        "C",
        7,
        4
      ],
      [
        "red",
        "R",
        8,
        4
      ],
      [
        "black",
        "C",
        1,
        0
      ],
      [
        "black",
        "P",
        3,
        7
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        4,
        3
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "P",
        5,
        9
      ],
      [
        "black",
        "R",
        5,
        3
      ],
      [
        "black",
        "P",
        6,
        3
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵E9 E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "兵E9 D9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "車G8 G10+",
        "move": {
          "fromX": 6,
          "fromY": 2,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "車I6 I10+",
        "move": {
          "fromX": 8,
          "fromY": 4,
          "toX": 8,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1N8UmYzESZ/"
  },
  {
    "id": "jianghu-084",
    "title": "雪压梅梢",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        1,
        1
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "C",
        6,
        8
      ],
      [
        "red",
        "P",
        7,
        1
      ],
      [
        "black",
        "P",
        1,
        7
      ],
      [
        "black",
        "R",
        3,
        8
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "P",
        5,
        7
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮G2 x D2",
        "move": {
          "fromX": 6,
          "fromY": 8,
          "toX": 3,
          "toY": 8
        }
      },
      {
        "label": "B",
        "text": "兵D9 E9+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "兵F9 E9+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "兵D9 D10+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1QfUfY7Eaq/"
  },
  {
    "id": "jianghu-085",
    "title": "巧设链环",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "C",
        0,
        2
      ],
      [
        "red",
        "R",
        2,
        9
      ],
      [
        "red",
        "C",
        2,
        5
      ],
      [
        "red",
        "P",
        2,
        1
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "P",
        3,
        2
      ],
      [
        "red",
        "H",
        7,
        5
      ],
      [
        "red",
        "P",
        7,
        0
      ],
      [
        "black",
        "C",
        0,
        0
      ],
      [
        "black",
        "R",
        1,
        8
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "K",
        4,
        1
      ],
      [
        "black",
        "H",
        6,
        0
      ],
      [
        "black",
        "R",
        8,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵C9 D9+",
        "move": {
          "fromX": 2,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "兵D8 D9+",
        "move": {
          "fromX": 3,
          "fromY": 2,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "兵D8 x E8+",
        "move": {
          "fromX": 3,
          "fromY": 2,
          "toX": 4,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "炮A8 A9+",
        "move": {
          "fromX": 0,
          "fromY": 2,
          "toX": 0,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1ermdYuEM8/"
  },
  {
    "id": "jianghu-086",
    "title": "猿猴摘果",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "P",
        7,
        0
      ],
      [
        "red",
        "C",
        8,
        8
      ],
      [
        "red",
        "R",
        8,
        7
      ],
      [
        "red",
        "R",
        8,
        6
      ],
      [
        "black",
        "E",
        0,
        2
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "H",
        4,
        8
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "C",
        4,
        0
      ],
      [
        "black",
        "R",
        5,
        8
      ],
      [
        "black",
        "K",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車I3 F3+",
        "move": {
          "fromX": 8,
          "fromY": 7,
          "toX": 5,
          "toY": 7
        }
      },
      {
        "label": "B",
        "text": "兵H10 G10+",
        "move": {
          "fromX": 7,
          "fromY": 0,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "兵E9 x E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "兵E9 F9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 5,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV16XmmYfEXd/"
  },
  {
    "id": "jianghu-087",
    "title": "紧守虎牢",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "H",
        1,
        3
      ],
      [
        "red",
        "R",
        1,
        2
      ],
      [
        "red",
        "C",
        2,
        4
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "P",
        4,
        6
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "P",
        7,
        0
      ],
      [
        "black",
        "C",
        0,
        4
      ],
      [
        "black",
        "P",
        2,
        7
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "E",
        6,
        0
      ],
      [
        "black",
        "R",
        7,
        7
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮C6 C10+",
        "move": {
          "fromX": 2,
          "fromY": 4,
          "toX": 2,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "馬B7 D8+",
        "move": {
          "fromX": 1,
          "fromY": 3,
          "toX": 3,
          "toY": 2
        }
      },
      {
        "label": "C",
        "text": "兵F9 F10+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 5,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "兵F9 x E9+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1PM1xYYEbM/"
  },
  {
    "id": "jianghu-088",
    "title": "孤山放鹤",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "C",
        3,
        2
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "P",
        5,
        4
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "R",
        6,
        9
      ],
      [
        "red",
        "R",
        6,
        2
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "R",
        6,
        7
      ],
      [
        "black",
        "R",
        7,
        2
      ],
      [
        "black",
        "P",
        8,
        8
      ],
      [
        "black",
        "E",
        8,
        2
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車G1 x G3",
        "move": {
          "fromX": 6,
          "fromY": 9,
          "toX": 6,
          "toY": 7
        }
      },
      {
        "label": "B",
        "text": "車G8 x G3",
        "move": {
          "fromX": 6,
          "fromY": 2,
          "toX": 6,
          "toY": 7
        }
      },
      {
        "label": "C",
        "text": "炮D8 x H8",
        "move": {
          "fromX": 3,
          "fromY": 2,
          "toX": 7,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "兵D9 E9+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1xcy6Y6EoB/"
  },
  {
    "id": "jianghu-089",
    "title": "倒挂珠帘",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        0,
        1
      ],
      [
        "red",
        "H",
        4,
        7
      ],
      [
        "red",
        "R",
        4,
        2
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "P",
        5,
        3
      ],
      [
        "red",
        "C",
        5,
        0
      ],
      [
        "black",
        "R",
        1,
        1
      ],
      [
        "black",
        "E",
        2,
        0
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "P",
        3,
        7
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "K",
        5,
        1
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵A9 x B9",
        "move": {
          "fromX": 0,
          "fromY": 1,
          "toX": 1,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "兵F7 F8+",
        "move": {
          "fromX": 5,
          "fromY": 3,
          "toX": 5,
          "toY": 2
        }
      },
      {
        "label": "C",
        "text": "車E8 F8+",
        "move": {
          "fromX": 4,
          "fromY": 2,
          "toX": 5,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "車E8 E9+",
        "move": {
          "fromX": 4,
          "fromY": 2,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1YAmGYjEG7/"
  },
  {
    "id": "jianghu-090",
    "title": "虎口拔牙",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        2,
        1
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "P",
        5,
        3
      ],
      [
        "red",
        "R",
        7,
        9
      ],
      [
        "red",
        "C",
        7,
        7
      ],
      [
        "red",
        "R",
        8,
        9
      ],
      [
        "black",
        "P",
        1,
        7
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "R",
        5,
        1
      ],
      [
        "black",
        "C",
        5,
        0
      ],
      [
        "black",
        "P",
        8,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮H3 H10+",
        "move": {
          "fromX": 7,
          "fromY": 7,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "炮H3 E3+",
        "move": {
          "fromX": 7,
          "fromY": 7,
          "toX": 4,
          "toY": 7
        }
      },
      {
        "label": "C",
        "text": "兵D9 x E9+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "兵D9 x D10+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1H11kYGEYR/"
  },
  {
    "id": "jianghu-091",
    "title": "先发制人",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "C",
        0,
        5
      ],
      [
        "red",
        "R",
        1,
        9
      ],
      [
        "red",
        "P",
        2,
        6
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "P",
        4,
        6
      ],
      [
        "red",
        "E",
        8,
        7
      ],
      [
        "black",
        "R",
        2,
        7
      ],
      [
        "black",
        "C",
        3,
        7
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "P",
        8,
        4
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵D9 x E9+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "兵D9 D10+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "炮A5 A10",
        "move": {
          "fromX": 0,
          "fromY": 5,
          "toX": 0,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "車B1 B10+",
        "move": {
          "fromX": 1,
          "fromY": 9,
          "toX": 1,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV17M4FeQEos/"
  },
  {
    "id": "jianghu-092",
    "title": "落底金钱",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        2,
        1
      ],
      [
        "red",
        "P",
        2,
        0
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "R",
        8,
        8
      ],
      [
        "black",
        "R",
        1,
        0
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "R",
        3,
        0
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "P",
        7,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵C10 x D10+",
        "move": {
          "fromX": 2,
          "fromY": 0,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "兵C10 x B10",
        "move": {
          "fromX": 2,
          "fromY": 0,
          "toX": 1,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車I2 x H2",
        "move": {
          "fromX": 8,
          "fromY": 8,
          "toX": 7,
          "toY": 8
        }
      },
      {
        "label": "D",
        "text": "車I2 I10+",
        "move": {
          "fromX": 8,
          "fromY": 8,
          "toX": 8,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1Svxae8EB7/"
  },
  {
    "id": "jianghu-093",
    "title": "铁马犁春",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "H",
        6,
        5
      ],
      [
        "black",
        "R",
        1,
        9
      ],
      [
        "black",
        "P",
        1,
        8
      ],
      [
        "black",
        "P",
        2,
        8
      ],
      [
        "black",
        "P",
        2,
        7
      ],
      [
        "black",
        "C",
        3,
        9
      ],
      [
        "black",
        "R",
        3,
        8
      ],
      [
        "black",
        "P",
        3,
        5
      ],
      [
        "black",
        "C",
        3,
        2
      ],
      [
        "black",
        "H",
        3,
        1
      ],
      [
        "black",
        "H",
        4,
        1
      ],
      [
        "black",
        "P",
        5,
        6
      ],
      [
        "black",
        "A",
        5,
        2
      ],
      [
        "black",
        "K",
        5,
        1
      ],
      [
        "black",
        "A",
        5,
        0
      ],
      [
        "black",
        "E",
        6,
        4
      ],
      [
        "black",
        "E",
        6,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "馬G5 H3",
        "move": {
          "fromX": 6,
          "fromY": 5,
          "toX": 7,
          "toY": 7
        }
      },
      {
        "label": "B",
        "text": "馬G5 I4",
        "move": {
          "fromX": 6,
          "fromY": 5,
          "toX": 8,
          "toY": 6
        }
      },
      {
        "label": "C",
        "text": "馬G5 I6",
        "move": {
          "fromX": 6,
          "fromY": 5,
          "toX": 8,
          "toY": 4
        }
      },
      {
        "label": "D",
        "text": "馬G5 E6",
        "move": {
          "fromX": 6,
          "fromY": 5,
          "toX": 4,
          "toY": 4
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1XeszeJEsU/"
  },
  {
    "id": "jianghu-094",
    "title": "芳洲拾翠",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "P",
        4,
        3
      ],
      [
        "red",
        "E",
        6,
        5
      ],
      [
        "red",
        "H",
        6,
        2
      ],
      [
        "red",
        "C",
        6,
        0
      ],
      [
        "red",
        "R",
        7,
        1
      ],
      [
        "red",
        "E",
        8,
        7
      ],
      [
        "red",
        "P",
        8,
        0
      ],
      [
        "black",
        "P",
        1,
        8
      ],
      [
        "black",
        "H",
        2,
        0
      ],
      [
        "black",
        "A",
        3,
        2
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "P",
        4,
        6
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "R",
        5,
        6
      ],
      [
        "black",
        "P",
        7,
        9
      ],
      [
        "black",
        "C",
        7,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵D9 E9+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "兵D9 x D10+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車H9 E9+",
        "move": {
          "fromX": 7,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "車H9 F9",
        "move": {
          "fromX": 7,
          "fromY": 1,
          "toX": 5,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1YosheaE11/"
  },
  {
    "id": "jianghu-095",
    "title": "双马盘槽",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "C",
        3,
        2
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "P",
        4,
        2
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "C",
        8,
        6
      ],
      [
        "red",
        "R",
        8,
        4
      ],
      [
        "red",
        "R",
        8,
        3
      ],
      [
        "black",
        "R",
        2,
        6
      ],
      [
        "black",
        "H",
        3,
        8
      ],
      [
        "black",
        "R",
        3,
        7
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "E",
        6,
        0
      ],
      [
        "black",
        "H",
        8,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮D8 x D2+",
        "move": {
          "fromX": 3,
          "fromY": 2,
          "toX": 3,
          "toY": 8
        }
      },
      {
        "label": "B",
        "text": "兵E9 E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "兵E9 D9+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "D",
        "text": "炮I4 D4+",
        "move": {
          "fromX": 8,
          "fromY": 6,
          "toX": 3,
          "toY": 6
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1QjtBe9EdB/"
  },
  {
    "id": "jianghu-096",
    "title": "镇守三关",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "C",
        0,
        9
      ],
      [
        "red",
        "R",
        0,
        6
      ],
      [
        "red",
        "P",
        1,
        0
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "H",
        5,
        6
      ],
      [
        "red",
        "C",
        7,
        0
      ],
      [
        "black",
        "R",
        4,
        8
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "P",
        6,
        8
      ],
      [
        "black",
        "P",
        7,
        9
      ],
      [
        "black",
        "C",
        7,
        6
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "馬F4 x E2",
        "move": {
          "fromX": 5,
          "fromY": 6,
          "toX": 4,
          "toY": 8
        }
      },
      {
        "label": "B",
        "text": "馬F4 x G2",
        "move": {
          "fromX": 5,
          "fromY": 6,
          "toX": 6,
          "toY": 8
        }
      },
      {
        "label": "C",
        "text": "兵D9 D10+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "車A4 E4+",
        "move": {
          "fromX": 0,
          "fromY": 6,
          "toX": 4,
          "toY": 6
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV1bdt3eGE5u/"
  },
  {
    "id": "jianghu-097",
    "title": "天地交泰",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        1,
        0
      ],
      [
        "red",
        "R",
        2,
        2
      ],
      [
        "red",
        "A",
        3,
        9
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "A",
        4,
        8
      ],
      [
        "red",
        "K",
        5,
        8
      ],
      [
        "red",
        "P",
        6,
        2
      ],
      [
        "black",
        "C",
        2,
        6
      ],
      [
        "black",
        "E",
        2,
        4
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "R",
        6,
        7
      ],
      [
        "black",
        "P",
        6,
        3
      ],
      [
        "black",
        "P",
        8,
        3
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵D9 E9+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "車C8 x C6",
        "move": {
          "fromX": 2,
          "fromY": 2,
          "toX": 2,
          "toY": 4
        }
      },
      {
        "label": "C",
        "text": "車C8 E8+",
        "move": {
          "fromX": 2,
          "fromY": 2,
          "toX": 4,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "車C8 C10+",
        "move": {
          "fromX": 2,
          "fromY": 2,
          "toX": 2,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "D",
    "source": "https://www.bilibili.com/video/BV19otbevEQt/"
  },
  {
    "id": "jianghu-098",
    "title": "小伏炮",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "R",
        6,
        2
      ],
      [
        "red",
        "C",
        8,
        6
      ],
      [
        "red",
        "C",
        8,
        5
      ],
      [
        "black",
        "P",
        1,
        9
      ],
      [
        "black",
        "P",
        4,
        7
      ],
      [
        "black",
        "C",
        5,
        9
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "K",
        5,
        0
      ],
      [
        "black",
        "E",
        6,
        0
      ],
      [
        "black",
        "E",
        8,
        2
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車G8 F8+",
        "move": {
          "fromX": 6,
          "fromY": 2,
          "toX": 5,
          "toY": 2
        }
      },
      {
        "label": "B",
        "text": "炮I4 I2",
        "move": {
          "fromX": 8,
          "fromY": 6,
          "toX": 8,
          "toY": 8
        }
      },
      {
        "label": "C",
        "text": "炮I5 E5",
        "move": {
          "fromX": 8,
          "fromY": 5,
          "toX": 4,
          "toY": 5
        }
      },
      {
        "label": "D",
        "text": "車G8 x G10+",
        "move": {
          "fromX": 6,
          "fromY": 2,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1iQ4Ce3E7h/"
  },
  {
    "id": "jianghu-099",
    "title": "龙凤呈祥",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "A",
        3,
        7
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "A",
        4,
        8
      ],
      [
        "red",
        "H",
        5,
        3
      ],
      [
        "red",
        "E",
        6,
        9
      ],
      [
        "red",
        "C",
        7,
        6
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "R",
        5,
        8
      ],
      [
        "black",
        "K",
        5,
        1
      ],
      [
        "black",
        "A",
        5,
        0
      ],
      [
        "black",
        "P",
        7,
        7
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "馬F7 D8+",
        "move": {
          "fromX": 5,
          "fromY": 3,
          "toX": 3,
          "toY": 2
        }
      },
      {
        "label": "B",
        "text": "馬F7 H8+",
        "move": {
          "fromX": 5,
          "fromY": 3,
          "toX": 7,
          "toY": 2
        }
      },
      {
        "label": "C",
        "text": "馬F7 D6",
        "move": {
          "fromX": 5,
          "fromY": 3,
          "toX": 3,
          "toY": 4
        }
      },
      {
        "label": "D",
        "text": "馬F7 H6",
        "move": {
          "fromX": 5,
          "fromY": 3,
          "toX": 7,
          "toY": 4
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV1ZmpTeYEcL/"
  },
  {
    "id": "jianghu-100",
    "title": "小青龙",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "E",
        2,
        9
      ],
      [
        "red",
        "P",
        2,
        1
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "K",
        5,
        7
      ],
      [
        "red",
        "H",
        6,
        1
      ],
      [
        "red",
        "C",
        7,
        8
      ],
      [
        "red",
        "R",
        7,
        6
      ],
      [
        "red",
        "R",
        7,
        5
      ],
      [
        "black",
        "R",
        2,
        7
      ],
      [
        "black",
        "P",
        2,
        6
      ],
      [
        "black",
        "P",
        2,
        5
      ],
      [
        "black",
        "C",
        3,
        9
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "R",
        4,
        8
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "A",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車H4 D4+",
        "move": {
          "fromX": 7,
          "fromY": 6,
          "toX": 3,
          "toY": 6
        }
      },
      {
        "label": "B",
        "text": "車H5 D5+",
        "move": {
          "fromX": 7,
          "fromY": 5,
          "toX": 3,
          "toY": 5
        }
      },
      {
        "label": "C",
        "text": "炮H2 I2",
        "move": {
          "fromX": 7,
          "fromY": 8,
          "toX": 8,
          "toY": 8
        }
      },
      {
        "label": "D",
        "text": "兵C9 C10+",
        "move": {
          "fromX": 2,
          "fromY": 1,
          "toX": 2,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "E",
    "source": "https://www.bilibili.com/video/BV18taZeQETJ/"
  },
  {
    "id": "jianghu-101",
    "title": "投鞭断流",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "A",
        3,
        7
      ],
      [
        "red",
        "R",
        3,
        2
      ],
      [
        "red",
        "K",
        4,
        7
      ],
      [
        "red",
        "A",
        5,
        7
      ],
      [
        "red",
        "R",
        5,
        1
      ],
      [
        "red",
        "C",
        6,
        3
      ],
      [
        "red",
        "H",
        6,
        2
      ],
      [
        "black",
        "H",
        2,
        9
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "C",
        4,
        9
      ],
      [
        "black",
        "P",
        4,
        4
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "P",
        5,
        9
      ],
      [
        "black",
        "A",
        5,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "炮G7 E7+",
        "move": {
          "fromX": 6,
          "fromY": 3,
          "toX": 4,
          "toY": 3
        }
      },
      {
        "label": "B",
        "text": "車D8 D10+",
        "move": {
          "fromX": 3,
          "fromY": 2,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車F9 x F10+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 5,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "車F9 x E9+",
        "move": {
          "fromX": 5,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV16Kije8EAX/"
  },
  {
    "id": "jianghu-102",
    "title": "梁山水泊林冲落草",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "A",
        3,
        9
      ],
      [
        "red",
        "K",
        4,
        7
      ],
      [
        "red",
        "P",
        6,
        2
      ],
      [
        "red",
        "E",
        8,
        7
      ],
      [
        "red",
        "H",
        8,
        0
      ],
      [
        "black",
        "E",
        0,
        2
      ],
      [
        "black",
        "E",
        2,
        4
      ],
      [
        "black",
        "K",
        5,
        1
      ],
      [
        "black",
        "A",
        5,
        0
      ],
      [
        "black",
        "C",
        8,
        9
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵G8 G9+",
        "move": {
          "fromX": 6,
          "fromY": 2,
          "toX": 6,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "馬I10 G9",
        "move": {
          "fromX": 8,
          "fromY": 0,
          "toX": 6,
          "toY": 1
        }
      },
      {
        "label": "C",
        "text": "馬I10 H8",
        "move": {
          "fromX": 8,
          "fromY": 0,
          "toX": 7,
          "toY": 2
        }
      },
      {
        "label": "D",
        "text": "相I3 G1",
        "move": {
          "fromX": 8,
          "fromY": 7,
          "toX": 6,
          "toY": 9
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1er421M7kR/"
  },
  {
    "id": "jianghu-103",
    "title": "浅池困龙",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "R",
        4,
        7
      ],
      [
        "red",
        "P",
        5,
        3
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "H",
        4,
        1
      ],
      [
        "black",
        "K",
        5,
        1
      ],
      [
        "black",
        "R",
        7,
        0
      ],
      [
        "black",
        "P",
        8,
        3
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵F7 F8+",
        "move": {
          "fromX": 5,
          "fromY": 3,
          "toX": 5,
          "toY": 2
        }
      },
      {
        "label": "B",
        "text": "車E3 E8",
        "move": {
          "fromX": 4,
          "fromY": 7,
          "toX": 4,
          "toY": 2
        }
      },
      {
        "label": "C",
        "text": "兵F7 G7",
        "move": {
          "fromX": 5,
          "fromY": 3,
          "toX": 6,
          "toY": 3
        }
      },
      {
        "label": "D",
        "text": "車E3 F3",
        "move": {
          "fromX": 4,
          "fromY": 7,
          "toX": 5,
          "toY": 7
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1AW42197y4/"
  },
  {
    "id": "jianghu-104",
    "title": "关公巡城",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "R",
        1,
        8
      ],
      [
        "red",
        "C",
        1,
        7
      ],
      [
        "red",
        "C",
        4,
        7
      ],
      [
        "red",
        "K",
        5,
        9
      ],
      [
        "red",
        "P",
        5,
        4
      ],
      [
        "red",
        "E",
        6,
        5
      ],
      [
        "red",
        "P",
        6,
        3
      ],
      [
        "red",
        "P",
        6,
        1
      ],
      [
        "red",
        "R",
        7,
        8
      ],
      [
        "red",
        "P",
        7,
        3
      ],
      [
        "red",
        "H",
        8,
        4
      ],
      [
        "red",
        "P",
        8,
        1
      ],
      [
        "black",
        "R",
        0,
        8
      ],
      [
        "black",
        "R",
        0,
        7
      ],
      [
        "black",
        "H",
        2,
        6
      ],
      [
        "black",
        "C",
        3,
        8
      ],
      [
        "black",
        "P",
        4,
        8
      ],
      [
        "black",
        "C",
        4,
        1
      ],
      [
        "black",
        "H",
        5,
        8
      ],
      [
        "black",
        "K",
        5,
        2
      ],
      [
        "black",
        "P",
        6,
        8
      ],
      [
        "black",
        "E",
        6,
        4
      ],
      [
        "black",
        "E",
        8,
        2
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵G7 F7+",
        "move": {
          "fromX": 6,
          "fromY": 3,
          "toX": 5,
          "toY": 3
        }
      },
      {
        "label": "B",
        "text": "兵G7 G8+",
        "move": {
          "fromX": 6,
          "fromY": 3,
          "toX": 6,
          "toY": 2
        }
      },
      {
        "label": "C",
        "text": "炮E3 F3+",
        "move": {
          "fromX": 4,
          "fromY": 7,
          "toX": 5,
          "toY": 7
        }
      },
      {
        "label": "D",
        "text": "兵F6 F7+",
        "move": {
          "fromX": 5,
          "fromY": 4,
          "toX": 5,
          "toY": 3
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "A",
    "source": "https://www.bilibili.com/video/BV1xx4y147zg/"
  },
  {
    "id": "jianghu-105",
    "title": "相煎何太急",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "A",
        3,
        9
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "E",
        6,
        5
      ],
      [
        "red",
        "C",
        8,
        5
      ],
      [
        "black",
        "A",
        3,
        0
      ],
      [
        "black",
        "H",
        4,
        1
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "A",
        5,
        0
      ],
      [
        "black",
        "H",
        8,
        8
      ],
      [
        "black",
        "C",
        8,
        0
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "相G5 I3",
        "move": {
          "fromX": 6,
          "fromY": 5,
          "toX": 8,
          "toY": 7
        }
      },
      {
        "label": "B",
        "text": "炮I5 H5",
        "move": {
          "fromX": 8,
          "fromY": 5,
          "toX": 7,
          "toY": 5
        }
      },
      {
        "label": "C",
        "text": "炮I5 I3",
        "move": {
          "fromX": 8,
          "fromY": 5,
          "toX": 8,
          "toY": 7
        }
      },
      {
        "label": "D",
        "text": "炮I5 I9",
        "move": {
          "fromX": 8,
          "fromY": 5,
          "toX": 8,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV17i421h7vR/"
  },
  {
    "id": "jianghu-106",
    "title": "诸葛用兵",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        0,
        1
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "R",
        4,
        4
      ],
      [
        "red",
        "P",
        4,
        1
      ],
      [
        "red",
        "A",
        5,
        7
      ],
      [
        "red",
        "P",
        5,
        1
      ],
      [
        "red",
        "H",
        6,
        3
      ],
      [
        "red",
        "C",
        8,
        6
      ],
      [
        "red",
        "R",
        8,
        5
      ],
      [
        "black",
        "P",
        1,
        8
      ],
      [
        "black",
        "R",
        3,
        8
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "C",
        4,
        3
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "P",
        5,
        8
      ],
      [
        "black",
        "E",
        6,
        0
      ],
      [
        "black",
        "C",
        8,
        7
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車I5 D5+",
        "move": {
          "fromX": 8,
          "fromY": 5,
          "toX": 3,
          "toY": 5
        }
      },
      {
        "label": "B",
        "text": "炮I4 D4",
        "move": {
          "fromX": 8,
          "fromY": 6,
          "toX": 3,
          "toY": 6
        }
      },
      {
        "label": "C",
        "text": "兵E9 E10+",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 4,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "兵E9 D9",
        "move": {
          "fromX": 4,
          "fromY": 1,
          "toX": 3,
          "toY": 1
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "B",
    "source": "https://www.bilibili.com/video/BV1bx4y1x7WM/"
  },
  {
    "id": "jianghu-107",
    "title": "三献刖足",
    "kind": "choice",
    "side": "red",
    "target": "red-win",
    "pieces": [
      [
        "red",
        "P",
        1,
        1
      ],
      [
        "red",
        "H",
        2,
        2
      ],
      [
        "red",
        "R",
        2,
        1
      ],
      [
        "red",
        "K",
        4,
        9
      ],
      [
        "red",
        "C",
        6,
        3
      ],
      [
        "red",
        "R",
        7,
        9
      ],
      [
        "black",
        "R",
        1,
        9
      ],
      [
        "black",
        "C",
        2,
        9
      ],
      [
        "black",
        "C",
        2,
        8
      ],
      [
        "black",
        "P",
        3,
        8
      ],
      [
        "black",
        "A",
        3,
        2
      ],
      [
        "black",
        "K",
        3,
        0
      ],
      [
        "black",
        "H",
        4,
        5
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "A",
        4,
        1
      ],
      [
        "black",
        "E",
        8,
        2
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "車C9 x E9+",
        "move": {
          "fromX": 2,
          "fromY": 1,
          "toX": 4,
          "toY": 1
        }
      },
      {
        "label": "B",
        "text": "車C9 C10+",
        "move": {
          "fromX": 2,
          "fromY": 1,
          "toX": 2,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "車H1 H10+",
        "move": {
          "fromX": 7,
          "fromY": 9,
          "toX": 7,
          "toY": 0
        }
      },
      {
        "label": "D",
        "text": "炮G7 D7+",
        "move": {
          "fromX": 6,
          "fromY": 3,
          "toX": 3,
          "toY": 3
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1oW421R7sb/"
  },
  {
    "id": "jianghu-108",
    "title": "并行不悖",
    "kind": "choice",
    "side": "red",
    "target": "draw",
    "pieces": [
      [
        "red",
        "P",
        2,
        0
      ],
      [
        "red",
        "K",
        3,
        9
      ],
      [
        "red",
        "P",
        3,
        1
      ],
      [
        "red",
        "E",
        4,
        7
      ],
      [
        "red",
        "R",
        6,
        5
      ],
      [
        "red",
        "C",
        7,
        5
      ],
      [
        "red",
        "C",
        8,
        5
      ],
      [
        "black",
        "P",
        2,
        5
      ],
      [
        "black",
        "C",
        3,
        5
      ],
      [
        "black",
        "R",
        4,
        8
      ],
      [
        "black",
        "P",
        4,
        5
      ],
      [
        "black",
        "E",
        4,
        2
      ],
      [
        "black",
        "K",
        4,
        0
      ],
      [
        "black",
        "P",
        5,
        9
      ],
      [
        "black",
        "P",
        6,
        9
      ],
      [
        "black",
        "P",
        7,
        9
      ],
      [
        "black",
        "C",
        8,
        8
      ]
    ],
    "options": [
      {
        "label": "A",
        "text": "兵C10 D10+",
        "move": {
          "fromX": 2,
          "fromY": 0,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "B",
        "text": "兵D9 D10+",
        "move": {
          "fromX": 3,
          "fromY": 1,
          "toX": 3,
          "toY": 0
        }
      },
      {
        "label": "C",
        "text": "炮H5 x E5+",
        "move": {
          "fromX": 7,
          "fromY": 5,
          "toX": 4,
          "toY": 5
        }
      },
      {
        "label": "D",
        "text": "車G5 G10+",
        "move": {
          "fromX": 6,
          "fromY": 5,
          "toX": 6,
          "toY": 0
        }
      },
      {
        "label": "E",
        "text": "以上选项都不对",
        "move": null
      }
    ],
    "answer": "C",
    "source": "https://www.bilibili.com/video/BV1ay411z7rQ/"
  }
]
