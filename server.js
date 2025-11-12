const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, { pingTimeout: 60000 });
const fs = require("fs");
const path = require("path");

app.use(express.static("public"));

let rawWords = {};
try { rawWords = JSON.parse(fs.readFileSync(path.join(__dirname,'words.json'),'utf8')); } catch(e) { rawWords = { categories: { general: ["brak"] } }; }

let categories = {};
if (Array.isArray(rawWords)) { categories["general"] = rawWords; }
else if (rawWords.categories) { categories = rawWords.categories; }
else { categories = rawWords; }

for (let cat in categories) {
  let seen = new Set();
  categories[cat] = categories[cat].map(w=>String(w).trim().replace(/[0-9]+$/,'').trim()).filter(w=>{ if(!w) return false; if(seen.has(w)) return false; seen.add(w); return true; });
}

try { fs.writeFileSync(path.join(__dirname,'public','words-used.json'), JSON.stringify({categories}, null, 2), "utf8"); } catch(e){}

const rooms = {};

function makeRoomCode(){ return Math.random().toString(36).substring(2,6).toUpperCase(); }
function generateId(){ return Math.random().toString(36).substring(2,10); }
function pickWord(room){
  const pool = categories[room.category] || [];
  if(pool.length===0) return "BRAK_SŁÓW";
  for(let i=0;i<500;i++){ const w=pool[Math.floor(Math.random()*pool.length)]; if(!room.lastWords.includes(w)) return w; }
  return pool[Math.floor(Math.random()*pool.length)];
}

io.on("connection", socket=>{
  socket.on("createRoom", ({name, category})=>{
    const code = makeRoomCode();
    if(!categories[category]) category = "general";
    const playerId = generateId();
    rooms[code] = { players: [{id:playerId,name, socketId: socket.id, connected:true}], host: playerId, category, lastWords: [], lastWordsLimit: 100 };
    socket.join(code);
    socket.emit("roomCreated", { code, playerId, category });
    io.to(code).emit("updatePlayers", rooms[code].players.map(p=>({name:p.name, connected:p.connected})));
  });

  socket.on("joinRoom", ({name, code, playerId})=>{
    code = (code||"").toUpperCase();
    const room = rooms[code];
    if(!room){ socket.emit("errorMsg","Pokój nie istnieje"); return; }
    if(playerId){
      const p = room.players.find(x=>x.id===playerId);
      if(p){ p.socketId = socket.id; p.connected = true; socket.join(code); socket.emit("joinedRoom",{code, playerId, category: room.category, name: p.name}); io.to(code).emit("updatePlayers", room.players.map(p=>({name:p.name, connected:p.connected}))); if(room.host===playerId) socket.emit("youAreHost"); return; }
    }
    const newId = generateId();
    const player = { id:newId, name, socketId: socket.id, connected:true };
    room.players.push(player);
    socket.join(code);
    socket.emit("joinedRoom", { code, playerId: newId, category: room.category, name });
    io.to(code).emit("updatePlayers", room.players.map(p=>({name:p.name, connected:p.connected})));
  });

  socket.on("startGame", ({code, playerId})=> startRound(code, playerId, "gameStarted"));
  socket.on("playAgain", ({code, playerId})=> startRound(code, playerId, "newRound"));

  function startRound(code, playerId, eventName){
    const room = rooms[code];
    if(!room) return;
    if(room.host !== playerId){ socket.emit("errorMsg","Tylko host może rozpocząć grę"); return; }
    const word = pickWord(room);
    room.lastWords.push(word); if(room.lastWords.length > room.lastWordsLimit) room.lastWords.shift();
    const players = room.players.filter(p=>p.connected);
    if(players.length===0) return;
    const impostor = players[Math.floor(Math.random()*players.length)];
    players.forEach(p=>{
      const payload = { word: (p.id===impostor.id ? "IMPOSTOR" : word), category: room.category };
      io.to(p.socketId).emit(eventName, payload);
    });
    io.to(code).emit("impostorChosen", { impostorId: impostor.id });
  }

  socket.on("endRoom", ({code, playerId})=>{
    const room = rooms[code]; if(!room) return;
    if(room.host !== playerId){ socket.emit("errorMsg","Tylko host może zakończyć pokój"); return; }
    io.to(code).emit("roomEnded", { code });
    room.players.forEach(p=>{ try{ io.sockets.sockets.get(p.socketId)?.leave(code); }catch(e){} });
    delete rooms[code];
  });

  socket.on("leaveRoom", ({code, playerId})=>{
    const room = rooms[code]; if(!room) return;
    const idx = room.players.findIndex(p=>p.id===playerId);
    if(idx>=0){ room.players.splice(idx,1); io.to(code).emit("updatePlayers", room.players.map(p=>({name:p.name, connected:p.connected}))); if(room.host===playerId && room.players.length>0){ room.host = room.players[0].id; io.to(room.players[0].socketId).emit("youAreHost"); } }
    socket.emit("leftRoomAck");
  });

  socket.on("disconnecting", ()=>{
    for(const code of socket.rooms){
      const room = rooms[code]; if(!room) continue;
      const p = room.players.find(pl=>pl.socketId===socket.id);
      if(p){ p.connected = false; io.to(code).emit("updatePlayers", room.players.map(pl=>({name:pl.name, connected:pl.connected}))); }
    }
  });

});

const PORT = process.env.PORT || 3000;
http.listen(PORT, ()=>console.log("Server running on "+PORT));
