// Bible Quiz Battle — Dami vs Betty
// Standalone real-time multiplayer server: Express + Socket.io.
// Two players, one room (4-letter code), 10 Bible questions, 15s each.
// Scoring is timed by THIS server, so no phone clock can cheat.
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const QUESTIONS_PER_GAME = 10;
const QUESTION_MS = 15000;
const REVEAL_MS = 5000;

const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions_bank.json'), 'utf8'));

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size, questions: BANK.length }));

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickQuestions() {
  // Random 10 questions; shuffle the options of each and remap the answer.
  return shuffle(BANK).slice(0, QUESTIONS_PER_GAME).map((q) => {
    const order = shuffle([0, 1, 2, 3]);
    return {
      q: q.q,
      options: order.map((i) => q.o[i]),
      answer: order.indexOf(q.a),
      ref: q.ref,
    };
  });
}

function makeCode() {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L, O — hard to misread
  let code = '';
  for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}

/** rooms: code -> { code, players: [{id, name, score, isHost}], questions, qi, phase, answers, timer, startedAt, rounds } */
const rooms = new Map();

function publicPlayers(room) {
  return room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: !!p.isHost }));
}

function emitLobby(room) {
  io.to(room.code).emit('lobby', { code: room.code, players: publicPlayers(room) });
}

function sendQuestion(room) {
  const q = room.questions[room.qi];
  room.phase = 'question';
  room.answers = {};
  room.questionStartedAt = Date.now();
  io.to(room.code).emit('question', {
    index: room.qi,
    total: QUESTIONS_PER_GAME,
    question: q.q,
    options: q.options,
    seconds: QUESTION_MS / 1000,
    scores: publicPlayers(room),
  });
  room.timer = setTimeout(() => reveal(room), QUESTION_MS);
}

function reveal(room) {
  if (room.phase !== 'question') return;
  clearTimeout(room.timer);
  room.phase = 'reveal';
  const q = room.questions[room.qi];
  const round = { index: room.qi, question: q.q, ref: q.ref, correct: q.answer, results: [] };
  for (const p of room.players) {
    const ans = room.answers[p.id];
    let earned = 0;
    if (ans && ans.choice === q.answer) {
      const elapsed = Math.min(ans.elapsedMs, QUESTION_MS);
      earned = 100 + Math.round(100 * (1 - elapsed / QUESTION_MS));
      p.score += earned;
    }
    round.results.push({ id: p.id, name: p.name, choice: ans ? ans.choice : null, earned, score: p.score });
  }
  room.rounds.push(round);
  io.to(room.code).emit('reveal', {
    index: room.qi, total: QUESTIONS_PER_GAME, correct: q.answer, ref: q.ref,
    results: round.results, scores: publicPlayers(room),
  });
  room.qi += 1;
  if (room.qi >= QUESTIONS_PER_GAME) {
    room.timer = setTimeout(() => finish(room), REVEAL_MS);
  } else {
    room.timer = setTimeout(() => sendQuestion(room), REVEAL_MS);
  }
}

function finish(room) {
  room.phase = 'finished';
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0] && sorted[0].score !== (sorted[1] && sorted[1].score) ? sorted[0] : null;
  io.to(room.code).emit('finished', {
    winner: winner ? { id: winner.id, name: winner.name, score: winner.score } : null,
    scores: publicPlayers(room),
    rounds: room.rounds,
  });
}

function startGame(room) {
  room.questions = pickQuestions();
  room.qi = 0;
  room.rounds = [];
  room.phase = 'question';
  for (const p of room.players) p.score = 0;
  io.to(room.code).emit('started', { total: QUESTIONS_PER_GAME, players: publicPlayers(room) });
  sendQuestion(room);
}

function cleanupRoom(room) {
  clearTimeout(room.timer);
  rooms.delete(room.code);
}

io.on('connection', (socket) => {
  let room = null;
  let me = null;

  socket.on('createRoom', ({ name }) => {
    let code = makeCode();
    while (rooms.has(code)) code = makeCode();
    room = { code, players: [], questions: [], qi: 0, phase: 'lobby', answers: {}, rounds: [], timer: null };
    rooms.set(code, room);
    me = { id: socket.id, name: (name || 'Dami').trim().slice(0, 20) || 'Dami', score: 0, isHost: true };
    room.players.push(me);
    socket.join(code);
    socket.emit('roomCreated', { code, link: null, players: publicPlayers(room) });
    emitLobby(room);
  });

  socket.on('joinRoom', ({ code, name }) => {
    const c = String(code || '').trim().toUpperCase();
    const r = rooms.get(c);
    if (!r) return socket.emit('errorMsg', { message: `Room ${c} not found. Check the code and try again.` });
    if (r.players.length >= 2) return socket.emit('errorMsg', { message: `Room ${c} is full — Dami vs Betty is a duel, two players only.` });
    if (r.phase !== 'lobby') return socket.emit('errorMsg', { message: `Room ${c} is already playing. Wait for the next battle.` });
    room = r;
    me = { id: socket.id, name: (name || 'Betty').trim().slice(0, 20) || 'Betty', score: 0, isHost: false };
    room.players.push(me);
    socket.join(c);
    socket.emit('roomJoined', { code: c, players: publicPlayers(room) });
    emitLobby(room);
  });

  socket.on('startGame', () => {
    if (!room || !me || !me.isHost) return;
    if (room.players.length < 2) return socket.emit('errorMsg', { message: 'Waiting for your opponent to join first.' });
    if (room.phase !== 'lobby' && room.phase !== 'finished') return;
    startGame(room);
  });

  socket.on('answer', ({ choice }) => {
    if (!room || room.phase !== 'question' || !me) return;
    if (room.answers[me.id] || typeof choice !== 'number' || choice < 0 || choice > 3) return;
    room.answers[me.id] = { choice, elapsedMs: Date.now() - room.questionStartedAt };
    socket.emit('answerLocked', { choice });
    io.to(room.code).emit('answered', { id: me.id, name: me.name, count: Object.keys(room.answers).length, total: room.players.length });
    if (Object.keys(room.answers).length >= room.players.length) reveal(room);
  });

  socket.on('rematch', () => {
    if (!room || !me) return;
    me.rematch = true;
    const ready = room.players.filter((p) => p.rematch).length;
    io.to(room.code).emit('rematchStatus', { ready, total: room.players.length });
    if (room.players.length === 2 && ready === 2) {
      for (const p of room.players) p.rematch = false;
      startGame(room);
    }
  });

  socket.on('disconnect', () => {
    if (!room || !me) return;
    room.players = room.players.filter((p) => p.id !== socket.id);
    if (room.players.length === 0) return cleanupRoom(room);
    // Hand host to the remaining player so the battle can still start.
    room.players[0].isHost = true;
    if (room.phase === 'question' || room.phase === 'reveal') {
      clearTimeout(room.timer);
      room.phase = 'lobby';
      io.to(room.code).emit('opponentLeft', { message: `${me.name} left. Waiting for a new opponent — share the code ${room.code}.` });
    }
    emitLobby(room);
  });
});

server.listen(PORT, () => {
  console.log(`Bible Quiz Battle live on http://localhost:${PORT} — ${BANK.length} questions loaded`);
});
