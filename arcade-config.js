(function arcadeConfig(root) {
  const CAMP_ARCADE_GAMES = [
    {
      id: "game-1",
      name: "2D Maze",
      qrPath: "/index.html?win=game-1#arcade",
    },
    {
      id: "game-2",
      name: "Tetris",
      qrPath: "/index.html?win=game-2#arcade",
    },
    {
      id: "game-3",
      name: "Survival",
      qrPath: "/index.html?win=game-3#arcade",
    },
    {
      id: "game-4",
      name: "SuperNova Rush",
      qrPath: "/index.html?win=game-4#arcade",
    },
    {
      id: "game-5",
      name: "Pac man",
      qrPath: "/index.html?win=game-5#arcade",
    },
    {
      id: "game-6",
      name: "Crafting table",
      qrPath: "/index.html?win=game-6#arcade",
    },
    {
      id: "game-7",
      name: "Tic-Tac-Toe",
      qrPath: "/index.html?win=game-7#arcade",
    },
    {
      id: "game-8",
      name: "The arcade",
      qrPath: "/index.html?win=game-8#arcade",
    },
    {
      id: "game-9",
      name: "Quiz",
      qrPath: "/index.html?win=game-9#arcade",
    },
    {
      id: "game-10",
      name: "Cup Stack Challenge",
      qrPath: "/index.html?win=game-10#arcade",
    },
    {
      id: "game-11",
      name: "Target Toss",
      qrPath: "/index.html?win=game-11#arcade",
    },
    {
      id: "game-12",
      name: "Plinko",
      qrPath: "/index.html?win=game-12#arcade",
    },
    {
      id: "game-13",
      name: "Claw Challenge",
      qrPath: "/index.html?win=game-13#arcade",
    },
    {
      id: "game-14",
      name: "Memory Match",
      qrPath: "/index.html?win=game-14#arcade",
    },
    {
      id: "game-15",
      name: "Spin to Win",
      qrPath: "/index.html?win=game-15#arcade",
    },
  ];

  const CAMP_ARCADE_CONFIG = {
    pollIntervalMs: 4000,
  };

  if (typeof module === "object" && module.exports) {
    module.exports = {
      CAMP_ARCADE_GAMES,
      CAMP_ARCADE_CONFIG,
    };
  }

  if (root) {
    root.CAMP_ARCADE_GAMES = CAMP_ARCADE_GAMES;
    root.CAMP_ARCADE_CONFIG = CAMP_ARCADE_CONFIG;
  }
})(typeof window !== "undefined" ? window : globalThis);