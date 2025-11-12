const socket = io();
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const startBtn = document.getElementById("startBtn");
const playAgainBtn = document.getElementById("playAgainBtn");
const endRoomBtn = document.getElementById("endRoomBtn");
const leaveBtn = document.getElementById("leaveBtn");
const menu = document.getElementById("menu");
const game = document.getElementById("game");
const playersDiv = document.getElementById("players");
const wordArea = document.getElementById("wordArea");
const yourWord = document.getElementById("yourWord");
const roomCodeText = document.getElementById("roomCode");
const errorDiv = document.getElementById("error");
const nameInput = document.getElementById("nameInput");
const categorySelect = document.getElementById("categorySelect");
const roomMessage = document.getElementById("roomMessage");

let currentRoom = null;
let playerId = localStorage.getItem("playerId") || null;
let playerName = localStorage.getItem("playerName") || "";
let amHost = false;

if (playerName) nameInput.value = playerName;

// load categories
fetch('/words-used.json').then(r=>r.json()).then(data=>{
  const cats = Object.keys(data.categories || data);
  categorySelect.innerHTML = cats.map(c=>`<option value="${c}">${c}</option>`).join('');
}).catch(e=>{
  fetch('/words.json').then(r=>r.json()).then(data=>{
    const cats = Object.keys(data.categories || data);
    categorySelect.innerHTML = cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  }).catch(err=>{ categorySelect.innerHTML = `<option value="general">general</option>`; });
});

createBtn.onclick = () => {
  const name = nameInput.value.trim();
  if (!name) { errorDiv.textContent = "Podaj nick"; return; }
  const category = categorySelect.value || "general";
  socket.emit("createRoom", { name, category });
  playerName = name;
  localStorage.setItem("playerName", name);
};

joinBtn.onclick = () => {
  const name = nameInput.value.trim();
  const code = document.getElementById("joinCode").value.trim().toUpperCase();
  if (!name || !code) { errorDiv.textContent = "Podaj nick i kod pokoju"; return; }
  socket.emit("joinRoom", { name, code, playerId });
  playerName = name;
  localStorage.setItem("playerName", name);
};

socket.on("roomCreated", ({code, playerId: pid, category}) => {
  currentRoom = code;
  playerId = pid;
  amHost = true;
  localStorage.setItem("playerId", playerId);
  roomCodeText.textContent = code;
  menu.style.display = "none";
  game.style.display = "block";
  startBtn.style.display = "inline-block";
  endRoomBtn.style.display = "inline-block";
  leaveBtn.style.display = "inline-block";
  roomMessage.textContent = '';
  document.getElementById("chosenCategory").textContent = category;
});

socket.on("joinedRoom", ({code, playerId: pid, category, name}) => {
  currentRoom = code;
  playerId = pid;
  localStorage.setItem("playerId", playerId);
  roomCodeText.textContent = code;
  menu.style.display = "none";
  game.style.display = "block";
  endRoomBtn.style.display = "none";
  leaveBtn.style.display = "inline-block";
  roomMessage.textContent = '';
  document.getElementById("chosenCategory").textContent = category;
});

socket.on("updatePlayers", (players) => {
  playersDiv.innerHTML = players.map(p=>`<div>${p.name}${p.connected? '': ' (offline)'}</div>`).join('');
});

socket.on("youAreHost", ()=> {
  amHost = true;
  startBtn.style.display = "inline-block";
  endRoomBtn.style.display = "inline-block";
});

startBtn.onclick = () => {
  if (!currentRoom) return;
  socket.emit("startGame", { code: currentRoom, playerId });
  startBtn.style.display = "none";
};

socket.on("gameStarted", ({word, category}) => {
  wordArea.style.display = "block";
  if (word === "IMPOSTOR") {
    yourWord.innerHTML = "<strong>Jesteś IMPOSTOREM</strong>";
  } else {
    yourWord.textContent = word;
  }
  playAgainBtn.style.display = "inline-block";
  errorDiv.textContent = "";
});

endRoomBtn.onclick = () => {
  if (!currentRoom) return;
  socket.emit("endRoom", { code: currentRoom, playerId });
};

leaveBtn.onclick = () => {
  if (!currentRoom) return;
  socket.emit("leaveRoom", { code: currentRoom, playerId });
  localStorage.removeItem("lastRoom");
  localStorage.removeItem("playerId");
  currentRoom = null;
  playerId = null;
  amHost = false;
  menu.style.display = "block";
  game.style.display = "none";
  endRoomBtn.style.display = "none";
  leaveBtn.style.display = "none";
  roomMessage.textContent = '';
};

socket.on('roomEnded', ({code}) => {
  if (currentRoom === code) {
    roomMessage.textContent = 'Pokój został zakończony przez hosta.';
    localStorage.removeItem("lastRoom");
    localStorage.removeItem("playerId");
    currentRoom = null;
    playerId = null;
    amHost = false;
    setTimeout(()=>{
      menu.style.display = 'block';
      game.style.display = 'none';
      endRoomBtn.style.display = 'none';
      leaveBtn.style.display = 'none';
      roomMessage.textContent = '';
    }, 1500);
  }
});

socket.on('leftRoomAck', ()=>{});

playAgainBtn.onclick = () => {
  if (!amHost) { errorDiv.textContent = "Tylko host może rozpocząć nową rundę"; return; }
  socket.emit("playAgain", { code: currentRoom, playerId });
  playAgainBtn.style.display = "none";
};

socket.on("newRound", ({word}) => {
  wordArea.style.display = "block";
  if (word === "IMPOSTOR") {
    yourWord.innerHTML = "<strong>Jesteś IMPOSTOREM</strong>";
  } else {
    yourWord.textContent = word;
  }
  playAgainBtn.style.display = "inline-block";
});

socket.on("errorMsg", (m) => {
  errorDiv.textContent = m;
});

window.addEventListener("load", ()=>{
  const savedRoom = localStorage.getItem("lastRoom");
  if (savedRoom && playerId) {
    socket.emit("joinRoom", { name: localStorage.getItem("playerName")||"Player", code: savedRoom, playerId });
  }
});

socket.on("joinedRoom", ({code})=>{
  localStorage.setItem("lastRoom", code);
});
socket.on("roomCreated", ({code})=>{
  localStorage.setItem("lastRoom", code);
});
