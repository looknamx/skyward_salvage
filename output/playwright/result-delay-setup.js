// Browser-only transport fixture; does not mutate the game server.
async (page) => {
  let feed;
  let snapshot;
  let terminal;
  await page.exposeFunction('qaResultAction', action => {
    if (action === 'finish') {
      terminal = JSON.parse(JSON.stringify(snapshot));
      terminal.mode = 'ffa'; terminal.phase = 'finished';
      terminal.activeId = null; terminal.deadline = 0;
      terminal.winnerId = terminal.players[0].id;
      terminal.players[1].hp = 0;
      feed.send(JSON.stringify({type:'shot',shot:{kind:'damage',paths:[[{x:210,y:450},{x:620,y:180},{x:1070,y:450}]],impacts:[{x:1070,y:450,radius:58,damage:100}],hitIds:[terminal.players[1].id]}}));
      feed.send(JSON.stringify({type:'state',state:terminal}));
      feed.send(JSON.stringify({type:'match-summary',summary:{code:terminal.code,mode:'ffa',winnerId:terminal.winnerId,winnerTeam:null,players:terminal.players}}));
    } else if (action === 'repeat') {
      feed.send(JSON.stringify({type:'state',state:terminal}));
    } else if (action === 'lobby') {
      const lobby = JSON.parse(JSON.stringify(snapshot)); lobby.phase = 'lobby'; lobby.activeId = null; lobby.terrain = [];
      feed.send(JSON.stringify({type:'state',state:lobby}));
    }
  });
  await page.routeWebSocket('**/ws', ws => {
    feed = ws;
    const server = ws.connectToServer();
    server.onMessage(message => {
      const event = JSON.parse(message);
      if (event.type === 'state') snapshot = event.state;
      ws.send(message);
    });
  });
  await page.reload();
}
