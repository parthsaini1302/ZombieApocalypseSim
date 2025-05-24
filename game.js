
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const CELL_SIZE = 20;
const ROWS = canvas.height / CELL_SIZE;
const COLS = canvas.width / CELL_SIZE;

// Game state
let grid = [];
let player = { x: 5, y: 5, health: 3 };
let humans = [];
let zombies = [];
let rescuedHumans = [];
let score = 0;
let gameOver = false;
let gameStarted = false;
let gracePeriod = 3; // seconds
let gameStartTime;
let lastZombieMoveTime;


// Colors
const COLORS = {
  empty: '#222',
  player: '#2196F3',
  human: '#4CAF50',
  zombie: '#F44336',
  safe: '#00E676',
  rescued: '#A5D6A7',
  target: 'rgba(255, 255, 0, 0.5)'
};

// Add this at the top with other constants
const DIFFICULTY = {
    EASY: { zombieSpeed: 300, damage: 0.5, humanCount: 5 },
    MEDIUM: { zombieSpeed: 260, damage: 1, humanCount: 10 },
    HARD: { zombieSpeed: 200, damage: 1, humanCount: 15 }
  };
let currentDifficulty = DIFFICULTY.MEDIUM;
let zombieMoveCounter = 0;
 
// Store player name
let playerName = '';

document.getElementById('player-name').addEventListener('input', function(e) {
    playerName = e.target.value.trim();
    localStorage.setItem('playerName', playerName); // Optional: Save for future sessions
});



// Initialize game
function initGame() {
  grid = Array(ROWS).fill().map(() => Array(COLS).fill('.'));
  
  // Create exit gate
  for (let y = 0; y < 3; y++) {
      for (let x = COLS - 3; x < COLS; x++) {
          grid[y][x] = 'E';
      }
  }

  // Reset player
  player = { x: 5, y: 5, health: 3 };
  grid[player.y][player.x] = 'P';

  // Clear and repopulate humans
  humans = [];
  for (let i = 0; i < currentDifficulty.humanCount; i++) {
      placeRandomHuman();
  }

  // Clear and repopulate zombies
  zombies = [];
  for (let i = 0; i < 5; i++) {
      placeRandomZombie();
  }

  // Reset other game state
  rescuedHumans = [];
  score = 0;
  gracePeriod = 3;
  gameTime = 0;
  zombieMoveCounter = 0;

  updateUI();
}

function placeRandomHuman() {
    let x, y;
    do {
      x = Math.floor(Math.random() * COLS);
      y = Math.floor(Math.random() * ROWS);
      // Don't place in exit gate (top-right 3x3)
    } while (grid[y][x] !== '.' || (y < 3 && x >= COLS - 3));
    
    humans.push({ x, y });
    grid[y][x] = 'H';
}

function placeRandomZombie() {
  let x, y;
  let attempts = 0;
  const maxAttempts = 100;
  
  do {
      x = Math.floor(Math.random() * COLS);
      y = Math.floor(Math.random() * ROWS);
      attempts++;
      
      // Prevent infinite loops
      if (attempts >= maxAttempts) {
          console.warn("Couldn't find valid zombie placement after", maxAttempts, "attempts");
          break;
      }
  } while (
      grid[y][x] !== '.' || 
      (Math.abs(x - player.x) + Math.abs(y - player.y)) < 5
  );
  
  zombies.push({ x, y });
  grid[y][x] = 'Z';
}

// Draw the game
function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw grid background first
  for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
          ctx.fillStyle = COLORS.empty;
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1);
      }
  }
  
  // Draw exit gate (safe zone) on top
  for (let y = 0; y < 3; y++) {
      for (let x = COLS - 3; x < COLS; x++) {
          ctx.fillStyle = 'white';
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1);
      }
  }
  
  // Draw all other entities
  for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
          let color;
          switch (grid[y][x]) {
              case 'P': color = COLORS.player; break;
              case 'H': color = COLORS.human; break;
              case 'Z': color = COLORS.zombie; break;
              default: continue;
          }
          ctx.fillStyle = color;
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1);
      }
  }
  
  // Draw rescued humans following player
  ctx.fillStyle = COLORS.rescued;
  for (const human of rescuedHumans) {
      ctx.fillRect(human.x * CELL_SIZE, human.y * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1);
  }
  
  // Draw player if in exit gate
  if (grid[player.y][player.x] === 'E') {
      ctx.fillStyle = COLORS.player;
      ctx.fillRect(player.x * CELL_SIZE, player.y * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1);
  }
  
  // Draw UI elements
  ctx.fillStyle = 'white';
  ctx.font = '16px Arial';
  ctx.fillText(`Health: ${player.health}`, 10, 20);
}

// Find path to target
function findPath(startX, startY, targetX, targetY) {
  const queue = [[startX, startY, []]];
  const visited = Array(ROWS).fill().map(() => Array(COLS).fill(false));
  visited[startY][startX] = true;

  while (queue.length > 0) {
    const [x, y, path] = queue.shift();

    // Check if reached target
    if (x === targetX && y === targetY) {
      return path[0]; // Return first step
    }

    // Check all directions
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;

      // Check boundaries and if already visited
      if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && !visited[ny][nx]) {
        visited[ny][nx] = true;

        // Check if cell is walkable (not a zombie)
        if (grid[ny][nx] !== 'Z') {
          queue.push([nx, ny, path.concat({ x: nx, y: ny })]);
        }
      }
    }
  }
  return null; // No path found
}


// Move units toward target
function moveToTarget(targetX, targetY) {
    // Move player
    const playerMove = findPath(player.x, player.y, targetX, targetY);
    if (playerMove) {
      // Only clear the cell if it's not the exit gate
      if (grid[player.y][player.x] !== 'E') {
          grid[player.y][player.x] = '.';
      }
      player.x = playerMove.x;
      player.y = playerMove.y;
      
      // Check if player picked up a human
      if (grid[player.y][player.x] === 'H') {
          const humanIndex = humans.findIndex(h => h.x === player.x && h.y === player.y);
          if (humanIndex !== -1) {
              rescuedHumans.push(humans[humanIndex]);
              humans.splice(humanIndex, 1);
              updateUI();
          }
      }
      
      // Only set to 'P' if not in exit gate
      if (grid[player.y][player.x] !== 'E') {
          grid[player.y][player.x] = 'P';
      }
    }
    // Move rescued humans toward player
    for (let i = 0; i < rescuedHumans.length; i++) {
      const human = rescuedHumans[i];
      const humanMove = findPath(human.x, human.y, player.x, player.y);
      if (humanMove) {
        grid[human.y][human.x] = '.';
        human.x = humanMove.x;
        human.y = humanMove.y;
        
        // Check if human reached safe zone
        if (grid[human.y][human.x] === 'E') {
          score++;
          rescuedHumans.splice(i, 1);
          i--; // Adjust index after removal
          updateUI(); // Update counter immediately when human reaches safe zone
          continue; // Skip setting grid for this human since it's rescued
        }
        
        grid[human.y][human.x] = 'H';
      }
    }
    
    drawGame();
}
function checkWinCondition() {
  // Check if all humans are rescued (either in exit gate or following player there)
  const allHumansRescued = humans.length === 0;
    
    // Check if player is in exit gate area (top-right 3x3)
  const inExitGate = player.y < 3 && player.x >= COLS - 3;
    
  if (allHumansRescued && inExitGate) {
    // Add any remaining rescued humans to score (those following player)
    score += rescuedHumans.length;
    rescuedHumans = [];
    updateUI();
    gameWon();    
  }
}
// Move zombies toward player
function moveZombies() {
  for (const zombie of zombies) {
      const zombieMove = findPath(zombie.x, zombie.y, player.x, player.y);
      if (zombieMove) {
          // Don't allow zombies to move into exit gate (safe zone)
          if (grid[zombieMove.y][zombieMove.x] === 'E') continue;
          
          grid[zombie.y][zombie.x] = '.';
          zombie.x = zombieMove.x;
          zombie.y = zombieMove.y;
          
          // Check if zombie attacked player (but not in safe zone)
          if (zombie.x === player.x && zombie.y === player.y && grid[player.y][player.x] !== 'E') {
              player.health -= currentDifficulty.damage;
              if (player.health <= 0) {
                  endGame();
                  return;
              }
          } else {
              grid[zombie.y][zombie.x] = 'Z';
          }
      }
  }
}

function setDifficulty(difficulty) {
    currentDifficulty = difficulty;
    document.getElementById('difficulty-display').textContent = 
      getDifficultyName(difficulty);
    initGame();
    drawGame();
}
  
  function getDifficultyName(difficulty) {
    for (const [key, value] of Object.entries(DIFFICULTY)) {
      if (value === difficulty) return key;
    }
    return "Medium";
}

// Handle canvas clicks
canvas.addEventListener('click', (e) => {
  if (gameOver) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
  const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);
  
  // Don't allow clicking on zombies or out of bounds
  if (x >= 0 && y >= 0 && x < COLS && y < ROWS && grid[y][x] !== 'Z') {
    gameStarted = true;
    moveToTarget(x, y);
    drawGame();
  }
});

// Add this to the existing code (right after the canvas click event listener)
document.addEventListener('keydown', (e) => {
    if (gameOver || !gameStarted) return;
    
    let dx = 0, dy = 0;
    
    switch(e.key) {
      case 'ArrowUp': dy = -1; break;
      case 'ArrowDown': dy = 1; break;
      case 'ArrowLeft': dx = -1; break;
      case 'ArrowRight': dx = 1; break;
      default: return;
    }
    
    const newX = player.x + dx;
    const newY = player.y + dy;
    
    if (newX >= 0 && newY >= 0 && newX < COLS && newY < ROWS && grid[newY][newX] !== 'Z') {
      // Only clear if not in exit gate
      if (grid[player.y][player.x] !== 'E') {
          grid[player.y][player.x] = '.';
      }
      player.x = newX;
      player.y = newY;
      
      // Check if player picked up a human
      if (grid[newY][newX] === 'H') {
          const humanIndex = humans.findIndex(h => h.x === newX && h.y === newY);
          if (humanIndex !== -1) {
              rescuedHumans.push(humans[humanIndex]);
              humans.splice(humanIndex, 1);
              updateUI();
          }
      }
      
      // Only set to 'P' if not in exit gate
      if (grid[newY][newX] !== 'E') {
          grid[newY][newX] = 'P';
      }
      
      // Move rescued humans
      for (let i = 0; i < rescuedHumans.length; i++) {
          const human = rescuedHumans[i];
          const humanMove = findPath(human.x, human.y, player.x, player.y);
          if (humanMove) {
              // Only clear if not in exit gate
              if (grid[human.y][human.x] !== 'E') {
                  grid[human.y][human.x] = '.';
              }
              human.x = humanMove.x;
              human.y = humanMove.y;
              
              // Check if human reached safe zone (now 'E' instead of 'S')
              if (grid[human.y][human.x] === 'E') {
                  score++;
                  rescuedHumans.splice(i, 1);
                  i--;
                  updateUI();
                  continue;
              }
              
              grid[human.y][human.x] = 'H';
          }
      }
      
      drawGame();
      checkWinCondition(); // Add this to check win condition after each move
    }
});

// Update UI elements
function updateUI() {
  document.getElementById('humansRemaining').textContent = humans.length;
  document.getElementById('rescuedCount').textContent = score;
  document.getElementById('playerHealth').textContent = player.health;
}

// Game loop
function gameLoop(timestamp) {
  if (gameOver) return;
  
  if (gameStarted) {
      if (gracePeriod > 0) {
          gracePeriod -= 1/60;
      } else {
          // Update game time
          gameTime = (timestamp - gameStartTime) / 1000;
          document.getElementById('gameTime').textContent = Math.floor(gameTime);
          
          // Move zombies at the appropriate interval
          if (timestamp - lastZombieMoveTime > currentDifficulty.zombieSpeed) {
              moveZombies();
              drawGame();
              checkWinCondition();
              lastZombieMoveTime = timestamp;
          }
      }
  }
  
  requestAnimationFrame(gameLoop);
}

// Add to startGame function
function startGame() {
  // Hide all screens and show game screen
  document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
  });
  document.getElementById('game-screen').classList.add('active');
  
  // Initialize game state
  gameStartTime = performance.now();
  lastZombieMoveTime = gameStartTime;
  initGame();
  drawGame();
  
  // Start the game loop
  gameStarted = true;
  gameOver = false;
  requestAnimationFrame(gameLoop);
}

function gameWon() {
  gameOver = true;
  const difficultyName = getDifficultyName(currentDifficulty);
  
  document.getElementById('result-title').textContent = 'Mission Accomplished!';
  document.getElementById('result-message').textContent = 
      `You successfully rescued all humans in ${Math.floor(gameTime)} seconds!`;
  
  showScreen('game-over');
  saveScore(score, Math.floor(gameTime), difficultyName);
}
// Add this function to save scores to Flask server
async function saveScore(score, time, difficulty) {
    try {
      const response = await fetch('/save_score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          score: score,
          time: time,
          difficulty: difficulty
        })
      });
      const data = await response.json();
      console.log('Score saved:', data);
    } catch (error) {
      console.error('Error saving score:', error);
    }
}
// End game
function endGame() {
  if (player.health <= 0) {
      gameOver = true;
      const difficultyName = getDifficultyName(currentDifficulty);
      
      document.getElementById('result-title').textContent = 'Game Over';
      document.getElementById('result-message').textContent = 
          `You rescued ${score} humans before being overwhelmed!`;
      
      showScreen('game-over');
      saveScore(score, Math.floor(gameTime), difficultyName);
  }
}

// Reset game
function resetGame() {
  // Reset game state
  gameOver = false;
  gameStarted = false;
  
  // Reinitialize the game
  startGame();
}

function changeDifficulty() {
  document.getElementById('gameOver').style.display = 'none';
  document.getElementById('menu').style.display = 'block';
  document.getElementById('gameUI').style.display = 'none';
  canvas.style.display = 'none';
}

function goToHomePage() {
  document.getElementById('gameOver').style.display = 'none';
  document.getElementById('menu').style.display = 'block';
  document.getElementById('gameUI').style.display = 'none';
  canvas.style.display = 'none';
}

// ===== UI MANAGEMENT =====
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}

// ===== EVENT LISTENERS FOR NEW UI =====
document.getElementById('start-game-btn').addEventListener('click', function() {
  showScreen('game-screen');
  startGame();
});

document.getElementById('how-to-play-btn').addEventListener('click', function() {
  showScreen('how-to-play');
});

document.querySelectorAll('.back-btn').forEach(btn => {
  btn.addEventListener('click', function() {
      showScreen('main-menu');
  });
});

document.getElementById('restart-btn').addEventListener('click', function() {
  if (confirm('Are you sure you want to restart? All progress will be lost.')) {
      resetGame();
  }
});

document.getElementById('play-again-btn').addEventListener('click', function() {
  resetGame();
  showScreen('game-screen');
});

document.getElementById('change-difficulty-btn').addEventListener('click', function() {
  showScreen('main-menu');
});

document.getElementById('main-menu-btn').addEventListener('click', function() {
  showScreen('main-menu');
});

// Difficulty selection
document.querySelectorAll('.difficulty-btn').forEach(btn => {
  btn.addEventListener('click', function() {
      document.querySelectorAll('.difficulty-btn').forEach(b => {
          b.classList.remove('active');
      });
      this.classList.add('active');
      
      const difficulty = this.getAttribute('data-difficulty');
      setDifficulty(DIFFICULTY[difficulty.toUpperCase()]);
  });
});

// Initialize the game
window.onload = function() {
  showScreen('main-menu');
  // Set medium difficulty by default
  setDifficulty(DIFFICULTY.MEDIUM);
};

