import * as THREE from "three";


const ARENA = 700;            // carte beaucoup plus grande
const CRASH_DAMAGE = 100;     // dégâts d'un impact sol / relief
const MAX_PARTICLES = 450;
const MAX_MISSILES = 14;
const LOCK_ANGLE = 0.12;

// --- Paramètres du modèle de G ---
const G0 = 9.81;       // m/s²
const UNIT = 4;        // 1 unité de monde = 4 m
const G_LIMIT = 30;    // facteur de charge max structurel (positif)
const G_NEG = -5;      // facteur de charge max négatif
const G_TOL = 30;      // tolérance du pilote
const G_STRAIN = 3;    // bonus quand on contracte (touche E)

// --- Paramètres des missiles ---
const MISSILE_G_LIMIT = 25; // facteur de charge max d'un missile

const keys = new Set();
const missiles = [];
const bolts = [];
const enemies = [];
const bursts = [];
const particles = [];
const debris = [];
const mountains = [];
const remotes = new Map();
const axisV = new THREE.Vector3();
const fireLog = [];
const boltLog = [];
const killLog = [];
let mode = "solo", net = null, myPeer = "", hostLabel = "", wasHost = false;
let down = false, kills = 0, deaths = 0, deathBy = "", lastHitBy = "";
let idSeq = 0, fireSeq = 0, boltSeq = 0, killSeq = 0, lastBolt = 0, lastKill = 0;
let tankT = 12, sendT = 0, boardT = 0, netJoined = 0;

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const forward = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const rightVec = new THREE.Vector3();
const gVec = new THREE.Vector3();
const upVec = new THREE.Vector3();
const prevFwd = new THREE.Vector3();
const axis = new THREE.Vector3();
const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const lookM = new THREE.Matrix4();
const lookQ = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, "YXZ");

let score = 0;
let wave = 1;
let hp = 100;
let yaw = 0;
let pitch = 0.15;
let yawT = 0;
let pitchT = 0.15;
let roll = 0;
let speed = 42;
let gLoad = 1;
let blood = 1;      // 1 = vision normale, 0 = G-LOC
let strainE = 1;    // endurance de la contraction anti-G
let gloc = 0;       // temps restant d'inconscience
let redout = 0;
let dmgAcc = 0;
let gReady = false;
let cooldown = 0;
let locked = null;
let running = false;
let last = performance.now();
let camKick = 0;
let smokeT = 0;

const canvas = document.querySelector("#view");
const hud = document.querySelector("#hud");
const overlay = document.querySelector("#overlay");
const startBtn = document.querySelector("#start");
const scoreEl = document.querySelector("#score");
const waveEl = document.querySelector("#wave");
const hpEl = document.querySelector("#hp");
const lockEl = document.querySelector("#lock");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b14);
scene.fog = new THREE.Fog(0x070b14, 200, 900);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(0, 8, 16);

scene.add(new THREE.HemisphereLight(0x9eb6ff, 0x1a2433, 1.1));
const sun = new THREE.DirectionalLight(0xfff1d0, 1.4);
sun.position.set(40, 80, 20);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(ARENA + 200, 64),
  new THREE.MeshStandardMaterial({ color: 0x121a28, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
scene.add(new THREE.GridHelper(ARENA * 2, 70, 0x2a3c55, 0x1c2838));
buildTerrain();

const stars = new THREE.Points(
  new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.BufferAttribute(randomStars(600), 3)
  ),
  new THREE.PointsMaterial({ color: 0xd7e4ff, size: 2, sizeAttenuation: false, fog: false })
);
scene.add(stars);

const player = makeCraft("player", 0x8fa7b8, 0x0b1218);
player.position.set(0, 40, 0);
scene.add(player);

const audio = new AudioBus();

// --- HUD des G (créé dynamiquement, aucun changement HTML nécessaire) ---
const vig = overlayDiv(4);
const redDiv = overlayDiv(3);
const gHud = document.createElement("div");
gHud.style.cssText =
  "position:fixed;left:24px;bottom:24px;width:190px;font:600 13px/1.5 ui-monospace,monospace;color:#cfe;pointer-events:none;z-index:5;text-shadow:0 0 6px #000;display:none";
gHud.innerHTML = `
  <div id="g-val" style="font-size:34px;line-height:1.1">1.0 G</div>
  <div id="g-state" style="height:18px"></div>
  <div>VISION</div><div style="height:6px;background:#1c2838"><div id="g-blood" style="height:100%;width:100%;background:#7dffb3"></div></div>
  <div style="margin-top:6px">CONTRACTION [E]</div><div style="height:6px;background:#1c2838"><div id="g-strain" style="height:100%;width:100%;background:#6fb4ff"></div></div>`;
document.body.appendChild(gHud);
const gValEl = gHud.querySelector("#g-val");
const gStateEl = gHud.querySelector("#g-state");
const gBloodEl = gHud.querySelector("#g-blood");
const gStrainEl = gHud.querySelector("#g-strain");

function overlayDiv(z) {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${z}`;
  document.body.appendChild(el);
  return el;
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Escape") document.exitPointerLock();
});
addEventListener("keyup", (event) => keys.delete(event.code));

canvas.addEventListener("click", () => {
  if (!running) return;
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
  else fireMissile();
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas || gloc > 0) return;
  yawT -= event.movementX * 0.0022;
  pitchT -= event.movementY * 0.0016;
  pitchT = clamp(pitchT, -0.7, 0.85);
});

startBtn.addEventListener("click", () => {
  overlay.hidden = true;
  hud.hidden = false;
  running = true;
  canvas.requestPointerLock();
});

spawnWave();
requestAnimationFrame(frame);

function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (running && (hp > 0 || net)) update(dt);
  else updateEffects(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function update(dt) {
  cooldown = Math.max(0, cooldown - dt);
  netTick(dt);
  if (!down) {
    flyPlayer(dt);
    updatePhysio(dt);
  }
  updateMissiles(dt);
  updateEnemies(dt);
  collideEnemies();
  updateBolts(dt);
  updateEffects(dt);
  updateLock();
  updateCamera(dt);
  stars.position.copy(player.position);
  damageSmoke(dt);
  updateRadar();
  updateGfx();
  lockEl.classList.toggle("on", locked !== null);
}

function flyPlayer(dt) {
  const out = gloc > 0;
  const boost = !out && (keys.has("ShiftLeft") || keys.has("ShiftRight")) ? 1.55 : 1;
  let throttle = 0.72;
  if (!out) {
    if (keys.has("KeyW") || keys.has("KeyZ")) throttle = 1;
    if (keys.has("KeyS")) throttle = 0.3;
  }
  const drag = 1 - clamp((Math.abs(gLoad) - 1) * 0.03, 0, 0.3);
  speed = damp(speed, 42 * throttle * boost * drag, 1.2, dt);

  const V = Math.max(speed, 8) * UNIT;
  const wMax = (Math.sqrt(G_LIMIT * G_LIMIT - 1) * G0) / V;
  const wDown = ((1 - G_NEG) * G0) / V;

  if (out) {
    yawT = yaw;
    pitchT = pitch;
  }
  yawT = clamp(yawT, yaw - 1.2, yaw + 1.2);
  pitchT = clamp(pitchT, pitch - 1, pitch + 1);

  let wy = out ? 0 : (yawT - yaw) * 5;
  let wp = out ? -0.08 : (pitchT - pitch) * 5;
  if (wp < 0) wp = Math.max(wp, -wDown);
  const mag = Math.hypot(wy, wp);
  if (mag > wMax) {
    wy *= wMax / mag;
    wp *= wMax / mag;
  }
  yaw += wy * dt;
  pitch = clamp(pitch + wp * dt, -0.9, 1);

  roll = damp(roll, clamp((wy / wMax) * 1.1, -1.1, 1.1), 6, dt);
  euler.set(pitch, yaw, roll);
  player.quaternion.setFromEuler(euler);

  forward.set(0, 0, -1).applyQuaternion(player.quaternion);
  rightVec.set(1, 0, 0).applyQuaternion(player.quaternion);
  const strafe = out ? 0 : (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") || keys.has("KeyQ") ? 1 : 0);
  const lift = out ? 0 : (keys.has("Space") ? 1 : 0) - (keys.has("KeyC") || keys.has("ControlLeft") ? 1 : 0);

  player.position.addScaledVector(forward, speed * dt);
  player.position.addScaledVector(rightVec, strafe * 22 * dt);
  player.position.y += lift * 24 * dt;
  player.position.x = clamp(player.position.x, -ARENA + 8, ARENA - 8);
  player.position.z = clamp(player.position.z, -ARENA + 8, ARENA - 8);
  player.position.y = Math.min(player.position.y, 140);
  if (hitTerrain(player.position, 1.6)) hurt(CRASH_DAMAGE);

  // --- Calcul réel du facteur de charge ---
  if (!gReady) {
    prevFwd.copy(forward);
    gReady = true;
  }
  gVec.copy(forward).sub(prevFwd).multiplyScalar(V / dt);
  prevFwd.copy(forward);
  gVec.y += G0;
  upVec.set(0, 1, 0).applyQuaternion(player.quaternion);
  const raw = (gVec.length() / G0) * (gVec.dot(upVec) < 0 ? -1 : 1);
  gLoad = damp(gLoad, raw, 14, dt);

  setFlames(player, clamp(throttle * boost, 0.3, 1.6));
}

function updatePhysio(dt) {
  const straining = keys.has("KeyE") && strainE > 0.02 && gloc <= 0;
  strainE = clamp(strainE + (straining ? -0.22 : 0.12) * dt, 0, 1);
  const tol = G_TOL + (straining ? G_STRAIN : 0);

  if (gloc > 0) {
    gloc -= dt;
    blood = 0.1;
    if (gloc <= 0) blood = 0.5;
  } else {
    if (gLoad > tol) blood -= (gLoad - tol) * 0.2 * dt;
    else blood += 0.3 * dt;
    blood = clamp(blood, 0, 1);
    if (blood <= 0.12) {
      gloc = 2.5;
      audio.blip(60, 0.4);
    }
  }

  redout = damp(redout, clamp((-0.5 - gLoad) / 2.5, 0, 1), 3, dt);
  if (redout > 0.7) {
    dmgAcc += 6 * dt;
    if (dmgAcc >= 4) {
      dmgAcc = 0;
      hurt(4);
    }
  }
}

function updateGfx() {
  gHud.style.display = hud.hidden ? "none" : "block";
  const vis = clamp((0.8 - blood) / 0.6, 0, 1);
  if (gloc > 0) {
    vig.style.background = "#000";
  } else {
    const r = 100 - vis * 95;
    vig.style.background = `radial-gradient(circle at 50% 50%, transparent ${r}%, rgba(0,0,0,${Math.min(1, vis * 1.15)}) ${r + 30}%)`;
  }
  redDiv.style.background = `rgba(190,10,10,${redout * 0.75})`;

  gValEl.textContent = `${gLoad.toFixed(1)} G`;
  gValEl.style.color = gLoad > 27 ? "#ff5a3c" : gLoad > 20 ? "#ffb020" : gLoad < -2.5 ? "#ff8080" : "#7dffb3";
  gStateEl.textContent = gloc > 0 ? "G-LOC" : gLoad < -3 ? "G NÉGATIFS" : vis > 0.2 ? "VISION RÉDUITE" : "";
  gBloodEl.style.width = `${blood * 100}%`;
  gStrainEl.style.width = `${strainE * 100}%`;
}

function fireMissile() {
  if (down || gloc > 0 || cooldown > 0 || missiles.length >= MAX_MISSILES) return;
  cooldown = 0.28;
  const missile = makeMissile();
  forward.set(0, 0, -1).applyQuaternion(player.quaternion);
  missile.position.copy(player.position).addScaledVector(forward, 2.2);
  missile.userData.speed = 80 + speed * 0.5;
  missile.userData.velocity.copy(forward).multiplyScalar(missile.userData.speed);
  missile.userData.target = locked;
  missile.userData.life = 4.5;
  scene.add(missile);
  missiles.push(missile);
  if (net) {
    const v = missile.userData.velocity;
    const p = missile.position;
    fireLog.push([++fireSeq, r1(p.x), r1(p.y), r1(p.z), r1(v.x), r1(v.y), r1(v.z), locked ? (locked.userData.remote ? locked.userData.peer : locked.userData.id) : 0]);
    if (fireLog.length > 4) fireLog.shift();
  }
  audio.blip(520, 0.08);
}

function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const missile = missiles[i];
    const data = missile.userData;
    const target = data.target;

    const mSpeed = data.speed;
    const V_ms = mSpeed * UNIT;

    if (target && target.parent) {
      const curDir = tmp2.copy(data.velocity).normalize();
      const targetDir = tmp.copy(target.position).sub(missile.position);

      if (targetDir.lengthSq() > 0.001) {
        targetDir.normalize();
        const angle = curDir.angleTo(targetDir);

        if (angle > 0.0001) {
          const maxTurnRate = (MISSILE_G_LIMIT * G0) / V_ms;
          const step = Math.min(angle, maxTurnRate * dt);

          axis.crossVectors(curDir, targetDir).normalize();
          if (axis.lengthSq() < 0.001) axis.set(0, 1, 0);

          curDir.applyAxisAngle(axis, step);
          data.velocity.copy(curDir).multiplyScalar(mSpeed);
        }
      }
    }

    missile.position.addScaledVector(data.velocity, dt);
    missile.quaternion.setFromUnitVectors(
      tmp2.set(0, 1, 0),
      tmp.copy(data.velocity).normalize()
    );
    data.life -= dt;
    data.trail = (data.trail || 0) - dt;
    if (data.trail <= 0) {
      data.trail = 0.03;
      spawnParticle(missile.position, ZERO, 0xffc070, 0.9, -0.3, 0.35, 0, true, 0.9);
      spawnParticle(missile.position, UP, 0x888888, 0.7, 1.8, 0.9, 0, false, 0.4);
    }

    const hit = missile.userData.remote && !isHost() ? null : enemies.find((enemy) => missile.position.distanceTo(enemy.position) < 2.4);
    const dead = data.life <= 0 || hitTerrain(missile.position, 0.4) || hit || netHit(missile);
    if (!dead) continue;
    explode(missile.position, hit ? 1.6 : 0.8);
    if (hit && !hit.userData.ghost) destroyEnemy(hit, true, missile.userData.remote ? missile.userData.owner : "me");
    scene.remove(missile);
    missiles.splice(i, 1);
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    const data = enemy.userData;
    if (data.ghost) {
      ghostStep(enemy, dt);
      continue;
    }
    if (data.kind === "tank") {
      updateTank(enemy, dt);
      continue;
    }
    data.fire -= dt;
    const boostK = steer(enemy, tmp, dt);
    data.velocity.lerp(tmp.multiplyScalar((24 + wave * 1.8) * boostK), 1 - Math.exp(-2 * dt));
    enemy.position.addScaledVector(data.velocity, dt);
    enemy.position.y = clamp(enemy.position.y, 6, 70);
    if (hitTerrain(enemy.position, 1.5)) {
      explode(enemy.position, 2);
      destroyEnemy(enemy, false);
      continue;
    }
    if (data.velocity.lengthSq() > 0.01) {
      // le nez de l'avion est sur -Z
      lookM.lookAt(ZERO, data.velocity, UP);
      lookQ.setFromRotationMatrix(lookM);
      enemy.quaternion.slerp(lookQ, 1 - Math.exp(-5 * dt));
    }

    const dist = enemy.position.distanceTo(player.position);
    if (!down && dist < 3.2) {
      hurt(18);
      explode(enemy.position, 1.8);
      destroyEnemy(enemy);
      continue;
    }
    if (data.fire <= 0 && dist < 90) {
      data.fire = 1.6 + Math.random();
      shootBolt(enemy);
    }
  }
  if (canSpawn()) {
    tankT -= dt;
    if (tankT <= 0) {
      spawnTank();
      tankT = tankCount() < 2 ? 0.3 : 12;
    }
  }
  if (canSpawn() && mode !== "pvp" && (hp > 0 || net) && !enemies.some((e) => e.userData.kind === "plane")) {
    wave += 1;
    spawnWave();
  }
}

function shootBolt(enemy) {
  const bolt = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5a3c })
  );
  bolt.position.copy(enemy.position);
  tmp.copy(nearestPlayerPos(enemy.position)).sub(enemy.position).normalize().multiplyScalar(34);
  bolt.userData.velocity = tmp.clone();
  if (net) {
    boltLog.push([++boltSeq, r1(bolt.position.x), r1(bolt.position.y), r1(bolt.position.z), r1(tmp.x), r1(tmp.y), r1(tmp.z)]);
    if (boltLog.length > 6) boltLog.shift();
  }
  bolt.userData.life = 3;
  scene.add(bolt);
  bolts.push(bolt);
}

function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const bolt = bolts[i];
    bolt.position.addScaledVector(bolt.userData.velocity, dt);
    bolt.userData.life -= dt;
    if (hitTerrain(bolt.position, 0.3)) {
      explode(bolt.position, 0.5);
      scene.remove(bolt);
      bolts.splice(i, 1);
      continue;
    }
    if (!down && bolt.position.distanceTo(player.position) < 1.7) {
      hurt(12);
      explode(bolt.position, 0.6);
      scene.remove(bolt);
      bolts.splice(i, 1);
      continue;
    }
    if (bolt.userData.life <= 0) {
      scene.remove(bolt);
      bolts.splice(i, 1);
    }
  }
}

function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const burst = bursts[i];
    burst.userData.life -= dt;
    const k = burst.userData.life / burst.userData.max;
    burst.scale.setScalar((0.4 + (1 - k) * 4) * burst.userData.size);
    burst.material.opacity = Math.max(0, k);
    if (burst.userData.life <= 0) {
      scene.remove(burst);
      burst.geometry.dispose();
      burst.material.dispose();
      bursts.splice(i, 1);
    }
  }
}

function updateLock() {
  forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  let best = null;
  let bestAngle = LOCK_ANGLE;
  for (const enemy of lockables()) {
    tmp.copy(enemy.position).sub(camera.position).normalize();
    const angle = forward.angleTo(tmp);
    if (angle < bestAngle) {
      best = enemy;
      bestAngle = angle;
    }
  }
  locked = best;
  for (const enemy of lockables()) {
    enemy.children[0].material.emissive.setHex(enemy === locked ? 0xffb020 : enemy.userData.remote ? 0x0b1218 : 0x3a120c);
  }
}

function updateCamera(dt) {
  const back = tmp.set(0, 2.6, 10).applyQuaternion(player.quaternion);
  camDesired.copy(player.position).add(back);
  camera.position.lerp(camDesired, 1 - Math.exp(-6 * dt));
  // tremblements à fort facteur de charge (plafonnés)
  const shake = Math.min(0.4, Math.max(0, Math.abs(gLoad) - 5.5) * 0.03) + camKick;
  camKick *= Math.exp(-5 * dt);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }
  lookAt.copy(player.position).add(forward.set(0, 0.4, -12).applyQuaternion(player.quaternion));
  camera.lookAt(lookAt);
  const fov = damp(camera.fov, 68 + (speed - 30) * 0.25, 3, dt);
  if (Math.abs(fov - camera.fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

function spawnWave() {
  const count = mode === "pvp" ? 0 : Math.min(3 + wave, 8);
  for (let i = 0; i < count; i++) enemies.push(spawnEnemy());
  while (tankCount() < 4) spawnTank();
  waveEl.textContent = `Vague ${wave}`;
}

function spawnEnemy() {
  const enemy = makeCraft("enemy", 0x9a5a48, 0x3a120c);
  enemy.scale.multiplyScalar(0.9);
  let tries = 0;
  do {
    const ang = rand(0, Math.PI * 2);
    const far = rand(180, 320);
    enemy.position.set(
      clamp(player.position.x + Math.cos(ang) * far, -ARENA + 20, ARENA - 20),
      rand(15, 50),
      clamp(player.position.z + Math.sin(ang) * far, -ARENA + 20, ARENA - 20)
    );
  } while (hitTerrain(enemy.position, 10) && ++tries < 8);
  enemy.userData.velocity = new THREE.Vector3();
  enemy.userData.goal = new THREE.Vector3();
  enemy.userData.fire = 1 + Math.random() * 2;
  enemy.userData.id = ++idSeq;
  enemy.userData.kind = "plane";
  enemy.userData.dodge = Math.random() < 0.5 ? 1 : -1;
  pickGoal(enemy.userData.goal);
  setFlames(enemy, 0.8);
  scene.add(enemy);
  return enemy;
}

function destroyEnemy(enemy, scored = true, killer = "me") {
  const index = enemies.indexOf(enemy);
  if (index < 0) return;
  enemies.splice(index, 1);
  scene.remove(enemy);
  spawnDebris(enemy.position, 10, 0x9a5a48);
  if (locked === enemy) locked = null;
  for (const missile of missiles) {
    if (missile.userData.target === enemy) missile.userData.target = null;
  }
  if (scored && !enemy.userData.ghost) {
    const tank = enemy.userData.kind === "tank";
    if (killer === "me") creditKill(tank);
    if (net) {
      killLog.push([++killSeq, tank ? 1 : 0, killer === "me" ? myPeer : killer]);
      if (killLog.length > 4) killLog.shift();
    }
  }
}

function hurt(amount) {
  hp = Math.max(0, hp - amount);
  hpEl.textContent = `Coque ${hp}`;
  audio.blip(90, 0.1);
  camKick = Math.min(1.2, Math.max(camKick, amount * 0.04));
  if (hp > 0) return;
  explode(player.position, 3);
  spawnDebris(player.position, 14, 0x8fa7b8);
  player.visible = false;
  if (net) {
    down = true;
    deaths++;
    deathBy = lastHitBy;
    hpEl.textContent = "Coque 0 · réapparition…";
    setTimeout(respawn, 3500);
    return;
  }
  running = false;
  document.exitPointerLock();
  overlay.hidden = false;
  hud.hidden = true;
  gHud.style.display = "none";
  radar.style.display = "none";
  vig.style.background = "none";
  redDiv.style.background = "none";
  overlay.querySelector("h1").textContent = "Appareil détruit";
  overlay.querySelector("p").textContent = `Score ${score} · vague ${wave}. Clique pour rejouer.`;
  startBtn.textContent = "Rejouer";
  startBtn.onclick = () => location.reload();
}

const pv = new THREE.Vector3();
const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
let glowTex = null;

const radar = document.createElement("canvas");
radar.width = radar.height = 140;
radar.style.cssText =
  "position:fixed;right:24px;bottom:24px;z-index:5;pointer-events:none;border-radius:50%;background:rgba(10,20,30,.55);display:none";
document.body.appendChild(radar);
const rctx = radar.getContext("2d");

function updateRadar() {
  radar.style.display = hud.hidden ? "none" : "block";
  rctx.clearRect(0, 0, 140, 140);
  rctx.strokeStyle = "#2a3c55";
  rctx.beginPath();
  rctx.arc(70, 70, 62, 0, Math.PI * 2);
  rctx.moveTo(108, 70);
  rctx.arc(70, 70, 38, 0, Math.PI * 2);
  rctx.moveTo(70, 8);
  rctx.lineTo(70, 132);
  rctx.moveTo(8, 70);
  rctx.lineTo(132, 70);
  rctx.stroke();
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  for (const e of enemies) {
    const dx = e.position.x - player.position.x;
    const dz = e.position.z - player.position.z;
    let fx = ((-dx * sy - dz * cy) / 450) * 62;
    let rx = ((dx * cy - dz * sy) / 450) * 62;
    const m = Math.hypot(fx, rx);
    if (m > 60) {
      fx *= 60 / m;
      rx *= 60 / m;
    }
    rctx.fillStyle = e === locked ? "#ffb020" : "#ff5a3c";
    rctx.fillRect(70 + rx - 2, 70 - fx - 2, 4, 4);
  }
  rctx.fillStyle = "#7dffb3";
  rctx.beginPath();
  rctx.moveTo(70, 63);
  rctx.lineTo(65, 75);
  rctx.lineTo(75, 75);
  rctx.fill();
}

function buildTerrain() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x1d2a3d, roughness: 1, flatShading: true });
  for (let i = 0; i < 60; i++) {
    let x, z;
    do {
      x = rand(-ARENA * 0.92, ARENA * 0.92);
      z = rand(-ARENA * 0.92, ARENA * 0.92);
    } while (Math.hypot(x, z) < 90);
    const r = rand(18, 55);
    const h = rand(25, 75);
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat);
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = Math.random() * 6;
    scene.add(mesh);
    mountains.push({ x, z, r, h });
  }
}

// collision sol + montagnes (cônes)
function hitTerrain(p, m) {
  if (p.y < m) return true;
  for (const t of mountains) {
    if (p.y >= t.h) continue;
    const rad = t.r * (1 - p.y / t.h) + m * 0.5;
    const dx = p.x - t.x;
    const dz = p.z - t.z;
    if (dx * dx + dz * dz < rad * rad) return true;
  }
  return false;
}

// collision avion contre avion ennemi
function collideEnemies() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const a = enemies[i];
    if (!a) continue;
    for (let j = i - 1; j >= 0; j--) {
      const b = enemies[j];
      if (!b || a.position.distanceToSquared(b.position) > 6.25) continue;
      explode(a.position, 2);
      explode(b.position, 1.6);
      destroyEnemy(a, false);
      destroyEnemy(b, false);
      break;
    }
  }
}

function damageSmoke(dt) {
  if (hp >= 45 || down) return;
  smokeT -= dt;
  if (smokeT > 0) return;
  smokeT = 0.04 + hp * 0.002;
  pv.set(0, 0, 2).applyQuaternion(player.quaternion).add(player.position);
  spawnParticle(pv, UP, 0x2a2a2a, 1.2, 3, 1.2, -2, false, 0.6);
}

function getGlow() {
  if (!glowTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.3, "rgba(255,255,255,0.6)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  return glowTex;
}

function spawnParticle(pos, vel, color, size, growth, life, gravity, additive, alpha = 1) {
  if (particles.length >= MAX_PARTICLES) return;
  const mat = new THREE.SpriteMaterial({
    map: getGlow(),
    color,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const s = new THREE.Sprite(mat);
  s.position.copy(pos);
  s.scale.setScalar(size);
  s.userData = { vel: vel.clone(), life, max: life, size, growth, gravity, alpha };
  scene.add(s);
  particles.push(s);
}

function randDir(out) {
  const u = Math.random() * 2 - 1;
  const t = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(t), u, s * Math.sin(t));
}

function spawnDebris(position, n, color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3 });
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(debrisGeo, mat);
    m.scale.set(rand(0.15, 0.6), rand(0.05, 0.2), rand(0.2, 0.8));
    m.position.copy(position);
    randDir(pv).multiplyScalar(rand(6, 22));
    m.userData = {
      vel: pv.clone(),
      spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)),
      life: rand(2.5, 4),
    };
    scene.add(m);
    debris.push(m);
  }
}

function updateParticles(dt) {
  const drag = Math.exp(-1.2 * dt);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    const d = p.userData;
    d.life -= dt;
    if (d.life <= 0) {
      scene.remove(p);
      p.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    d.vel.multiplyScalar(drag);
    d.vel.y -= d.gravity * dt;
    p.position.addScaledVector(d.vel, dt);
    const k = d.life / d.max;
    p.scale.setScalar(Math.max(0.05, d.size + d.growth * (1 - k)));
    p.material.opacity = k * d.alpha;
  }
}

function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const m = debris[i];
    const d = m.userData;
    d.life -= dt;
    if (d.life <= 0) {
      scene.remove(m);
      debris.splice(i, 1);
      continue;
    }
    d.vel.y -= 20 * dt;
    m.position.addScaledVector(d.vel, dt);
    m.rotation.x += d.spin.x * dt;
    m.rotation.y += d.spin.y * dt;
    m.rotation.z += d.spin.z * dt;
    if (m.position.y < 0.15) {
      m.position.y = 0.15;
      d.vel.set(0, 0, 0);
      d.spin.set(0, 0, 0);
    } else if (Math.random() < 0.15) {
      spawnParticle(m.position, ZERO, 0x333333, 0.8, 1.5, 0.6, 0, false, 0.4);
    }
  }
}

function updateEffects(dt) {
  updateBursts(dt);
  updateParticles(dt);
  updateDebris(dt);
}

// explosion : noyau, boule de feu, fumée, étincelles, flash, secousse et son
function explode(position, scale) {
  const d = position.distanceTo(player.position);
  camKick = Math.min(1.2, Math.max(camKick, (scale * 0.6) / (1 + d * 0.04)));
  audio.boom(clamp((scale * 0.6) / (1 + d * 0.012), 0, 1.2));
  coreBurst(position, scale);
  const n = Math.round(10 * scale);
  for (let i = 0; i < n; i++) {
    randDir(pv).multiplyScalar(rand(2, 9) * scale);
    spawnParticle(position, pv, i % 3 ? 0xff7a1a : 0xffd060, rand(1.6, 3) * scale, 4 * scale, rand(0.4, 0.9), 0, true, 1);
  }
  for (let i = 0; i < n; i++) {
    randDir(pv).multiplyScalar(rand(1, 4) * scale);
    pv.y += 2;
    spawnParticle(position, pv, 0x2a2a2e, rand(2, 3.5) * scale, 6 * scale, rand(1.4, 2.6), -1, false, 0.55);
  }
  for (let i = 0; i < n * 2; i++) {
    randDir(pv).multiplyScalar(rand(14, 34) * scale);
    spawnParticle(position, pv, 0xffd890, 0.5, -0.3, rand(0.4, 0.9), 22, true, 1);
  }
  spawnParticle(position, ZERO, 0xffffff, 7 * scale, 10 * scale, 0.18, 0, true, 1);
}

function coreBurst(position, scale) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true })
  );
  mesh.position.copy(position);
  mesh.userData.life = 0.35;
  mesh.userData.max = 0.35;
  mesh.userData.size = scale;
  mesh.scale.setScalar(scale);
  scene.add(mesh);
  bursts.push(mesh);
}

// ---------- Modèles d'avions (nez vers -Z) ----------

function planform(pts) {
  // pts : points (x, z) du contour d'une surface plate
  const shape = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0.035, 0);
  return geo;
}

function finGeo() {
  const shape = new THREE.Shape();
  shape.moveTo(-1.3, 0);
  shape.lineTo(-2.2, 1.6);
  shape.lineTo(-2.7, 1.6);
  shape.lineTo(-2.8, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
  geo.rotateY(Math.PI / 2);
  geo.translate(-0.035, 0, 0);
  return geo;
}

function makeCraft(kind, color, emissive) {
  const twin = kind === "enemy";
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color, emissive, roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0a1a28, emissive: 0x08121c, roughness: 0.05, metalness: 0.9,
  });
  const add = (geo, m, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  // fuselage (doit rester children[0] : sert au surlignage du verrouillage)
  add(new THREE.CylinderGeometry(0.34, 0.5, 5.4, 14).rotateX(Math.PI / 2), mat);
  add(new THREE.ConeGeometry(0.5, 2.4, 14).rotateX(-Math.PI / 2), mat, 0, 0, -4.0);
  add(new THREE.SphereGeometry(0.42, 16, 10).scale(0.75, 0.65, 2.4), glass, 0, 0.38, -1.2);
  add(new THREE.BoxGeometry(0.4, 0.45, 1.5), mat, 0.62, -0.12, -0.6);
  add(new THREE.BoxGeometry(0.4, 0.45, 1.5), mat, -0.62, -0.12, -0.6);

  for (const s of [1, -1]) {
    add(planform([[s * 0.4, -0.9], [s * 3.2, 1.6], [s * 3.2, 2.2], [s * 0.4, 2.3]]), mat, 0, -0.1, 0);
    add(planform([[s * 0.4, 1.6], [s * 1.9, 2.5], [s * 1.9, 2.9], [s * 0.4, 2.9]]), mat, 0, -0.05, 0);
    if (!twin) {
      add(planform([[s * 0.4, -2.0], [s * 1.4, -1.3], [s * 1.4, -1.0], [s * 0.4, -1.0]]), mat, 0, 0.1, 0);
      add(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6).rotateX(Math.PI / 2), mat, s * 3.25, -0.12, 1.9);
    }
  }

  if (twin) {
    for (const s of [1, -1]) {
      const fin = add(finGeo(), mat, s * 0.7, 0.2, 0);
      fin.rotation.z = -s * 0.22;
    }
  } else {
    add(finGeo(), mat, 0, 0.3, 0);
  }

  group.userData.flames = [];
  const engines = twin ? [-0.24, 0.24] : [0];
  const r = twin ? 0.22 : 0.34;
  for (const x of engines) {
    add(new THREE.CylinderGeometry(r, r * 0.8, 0.6, 12).rotateX(Math.PI / 2), mat, x, 0, 2.9);
    const flame = add(
      new THREE.ConeGeometry(r * 0.7, 1.4, 8).rotateX(Math.PI / 2).translate(0, 0, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.85 }),
      x, 0, 3.2
    );
    group.userData.flames.push(flame);
  }

  group.scale.setScalar(0.5);
  return group;
}

function setFlames(craft, level) {
  for (const flame of craft.userData.flames) {
    flame.scale.set(1, 1, 0.3 + level * 0.9 + Math.random() * 0.1);
  }
}

function makeMissile() {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 1.1, 6),
    new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xff9a1f, emissiveIntensity: 0.8 })
  );
  mesh.userData.velocity = new THREE.Vector3();
  return mesh;
}

function pickGoal(goal) {
  const c = nearestPlayerPos(goal);
  goal.set(
    clamp(c.x + rand(-160, 160), -ARENA + 20, ARENA - 20),
    rand(25, 60),
    clamp(c.z + rand(-160, 160), -ARENA + 20, ARENA - 20)
  );
}

function randomStars(count) {
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const radius = 900 + Math.random() * 200;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    data[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    data[i * 3 + 1] = Math.abs(radius * Math.cos(phi)) + 20;
    data[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  return data;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function damp(value, target, lambda, dt) {
  return THREE.MathUtils.damp(value, target, lambda, dt);
}

// ===== IA, chars au sol, multijoueur =====
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const board = document.createElement("div");
board.style.cssText = "position:fixed;top:10px;right:10px;color:#fff;font:600 12px/1.5 ui-monospace,monospace;white-space:pre;text-align:right;text-shadow:0 0 6px #000;pointer-events:none;z-index:10;display:none";
document.body.appendChild(board);
const codeEl = document.querySelector("#code");
const netMsg = document.querySelector("#netmsg");

function isHost() {
  return !net || (hostLabel !== "" && hostLabel === myPeer);
}
function canSpawn() {
  return !net || (isHost() && performance.now() - netJoined > 2500);
}
function tankCount() {
  return enemies.filter((e) => e.userData.kind === "tank").length;
}
function heal(n) {
  hp = Math.min(100, hp + n);
  hpEl.textContent = `Coque ${hp}`;
}
function creditKill(tank) {
  score += 100;
  scoreEl.textContent = `Score ${score}`;
  if (tank) heal(35);
}
function lockables() {
  if (mode !== "pvp") return enemies;
  const l = enemies.slice();
  for (const r of remotes.values()) if (r.mesh.visible) l.push(r.mesh);
  return l;
}
function nearestPlayerPos(from) {
  let best = down ? null : player.position;
  let bd = best ? best.distanceToSquared(from) : 1e18;
  for (const r of remotes.values()) {
    if (!r.mesh.visible) continue;
    const d2 = r.mesh.position.distanceToSquared(from);
    if (d2 < bd) {
      bd = d2;
      best = r.mesh.position;
    }
  }
  return best || player.position;
}
function inMountain(x, z, margin) {
  for (const t of mountains) if (Math.hypot(x - t.x, z - t.z) < t.r + margin) return true;
  return false;
}

// IA des avions : relief, missiles en approche, visée du joueur, séparation
function steer(enemy, out, dt) {
  const d = enemy.userData;
  const p = enemy.position;
  out.copy(d.goal).sub(p);
  if (out.lengthSq() < 900) pickGoal(d.goal);
  out.normalize();
  let boost = 1;
  if ((d.dodgeT = (d.dodgeT || 0) - dt) < 0) {
    d.dodgeT = rand(1.2, 2.5);
    d.dodge = -d.dodge;
  }
  for (const t of mountains) {
    const dx = p.x - t.x;
    const dz = p.z - t.z;
    const dist = Math.hypot(dx, dz) || 1;
    if (dist < t.r + 45 && p.y < t.h + 15) {
      out.x += (dx / dist) * 3;
      out.z += (dz / dist) * 3;
      out.y += 1.5;
      boost = 1.15;
    }
  }
  if (p.y < 25) out.y += (25 - p.y) * 0.15;
  for (const m of missiles) {
    if (m.userData.target !== enemy) continue;
    const dm = m.position.distanceTo(p);
    if (dm > 170) continue;
    axisV.copy(m.userData.velocity).normalize();
    axisV.crossVectors(axisV, UP).normalize().multiplyScalar(4 * d.dodge);
    out.add(axisV);
    out.y += (dm < 70 ? -1.2 : 1) * d.dodge;
    boost = 1.5;
  }
  tmp2.set(0, 0, -1).applyQuaternion(player.quaternion);
  axisV.copy(p).sub(player.position);
  const pd = axisV.length();
  if (!down && pd < 220 && tmp2.angleTo(axisV) < 0.18) {
    out.x += -d.velocity.z * 0.1 * d.dodge;
    out.z += d.velocity.x * 0.1 * d.dodge;
    boost = Math.max(boost, 1.25);
  }
  for (const o of enemies) {
    if (o === enemy || o.userData.kind !== "plane") continue;
    axisV.copy(p).sub(o.position);
    const dd = axisV.length();
    if (dd < 30 && dd > 0.01) out.addScaledVector(axisV, 2 / dd);
  }
  out.normalize();
  return boost;
}

function makeTank() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x55603a, emissive: 0x1a1f0e, roughness: 0.8 });
  const add = (geo, x, y, z, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
  };
  add(new THREE.BoxGeometry(3, 0.9, 4.8), 0, -0.3, 0);
  add(new THREE.BoxGeometry(0.8, 0.9, 5.2), 1.8, -0.4, 0);
  add(new THREE.BoxGeometry(0.8, 0.9, 5.2), -1.8, -0.4, 0);
  const turret = new THREE.Group();
  turret.position.y = 0.45;
  add(new THREE.CylinderGeometry(1, 1.2, 0.7, 12), 0, 0.2, 0, turret);
  add(new THREE.CylinderGeometry(0.13, 0.13, 3.4, 8).rotateX(Math.PI / 2), 0, 0.25, -2.2, turret);
  g.add(turret);
  g.userData.turret = turret;
  return g;
}
function spawnTank() {
  const t = makeTank();
  let x, z;
  let tries = 0;
  do {
    x = rand(-ARENA * 0.85, ARENA * 0.85);
    z = rand(-ARENA * 0.85, ARENA * 0.85);
  } while (inMountain(x, z, 12) && ++tries < 20);
  t.position.set(x, 1, z);
  Object.assign(t.userData, { kind: "tank", id: ++idSeq, fire: rand(1, 3), heading: rand(0, 6.28), turn: 0 });
  scene.add(t);
  enemies.push(t);
}
function aimTurret(t) {
  const tp = nearestPlayerPos(t.position);
  t.userData.turret.rotation.y = Math.atan2(-(tp.x - t.position.x), -(tp.z - t.position.z)) - t.rotation.y;
}
function updateTank(t, dt) {
  const d = t.userData;
  d.turn -= dt;
  if (d.turn <= 0) {
    d.turn = rand(4, 9);
    d.heading = rand(0, 6.28);
  }
  const nx = t.position.x - Math.sin(d.heading) * 5 * dt;
  const nz = t.position.z - Math.cos(d.heading) * 5 * dt;
  if (Math.abs(nx) < ARENA - 15 && Math.abs(nz) < ARENA - 15 && !inMountain(nx, nz, 10)) {
    t.position.x = nx;
    t.position.z = nz;
    t.rotation.y = d.heading;
  } else d.turn = 0;
  aimTurret(t);
  d.fire -= dt;
  if (d.fire <= 0 && nearestPlayerPos(t.position).distanceTo(t.position) < 110) {
    d.fire = 2 + Math.random() * 1.5;
    shootBolt(t);
  }
}
function ghostStep(e, dt) {
  const d = e.userData;
  if (!d.tp) return;
  e.position.lerp(d.tp, 1 - Math.exp(-10 * dt));
  if (d.kind === "tank") {
    e.rotation.y = d.ty;
    aimTurret(e);
  } else {
    euler.set(d.tpi, d.ty, 0);
    lookQ.setFromEuler(euler);
    e.quaternion.slerp(lookQ, 1 - Math.exp(-8 * dt));
  }
}

// ----- multijoueur (room : présence partagée, pas de serveur) -----
function peerColor(label) {
  let h = 0;
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) % 360;
  return new THREE.Color().setHSL(h / 360, 0.5, 0.55).getHex();
}
function netHit(m) {
  if (mode !== "pvp") return false;
  if (m.userData.remote) {
    if (!down && m.position.distanceTo(player.position) < 2.4) {
      lastHitBy = m.userData.owner;
      hurt(34);
      return true;
    }
  } else {
    for (const r of remotes.values()) if (r.mesh.visible && m.position.distanceTo(r.mesh.position) < 2.6) return true;
  }
  return false;
}
function spawnRemoteMissile(owner, f) {
  const m = makeMissile();
  m.position.set(f[1], f[2], f[3]);
  m.userData.velocity.set(f[4], f[5], f[6]);
  m.userData.speed = m.userData.velocity.length();
  m.userData.life = 4.5;
  m.userData.remote = true;
  m.userData.owner = owner;
  const t = f[7];
  m.userData.target = typeof t === "string" ? (t === myPeer ? player : remotes.get(t)?.mesh || null) : t ? enemies.find((e) => e.userData.id === t) || null : null;
  scene.add(m);
  missiles.push(m);
}
function makeBolt(b) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5a3c }));
  m.position.set(b[1], b[2], b[3]);
  m.userData.velocity = new THREE.Vector3(b[4], b[5], b[6]);
  m.userData.life = 3;
  scene.add(m);
  bolts.push(m);
}
function enemyList() {
  return enemies.map((e) => {
    const d = e.userData;
    const tank = d.kind === "tank";
    const len = d.velocity ? d.velocity.length() || 1 : 1;
    const yaw = tank ? e.rotation.y : Math.atan2(-d.velocity.x, -d.velocity.z);
    const pi = tank ? 0 : Math.asin(clamp(d.velocity.y / len, -1, 1));
    return [d.id, tank ? 1 : 0, r1(e.position.x), r1(e.position.y), r1(e.position.z), r2(yaw), r2(pi)];
  });
}
function syncGhosts(pr) {
  waveEl.textContent = `Vague ${pr.w || 1}`;
  const ids = new Set();
  for (const e of pr.E) {
    ids.add(e[0]);
    let g = enemies.find((x) => x.userData.id === e[0]);
    if (!g) {
      if (e[1]) g = makeTank();
      else {
        g = makeCraft("enemy", 0x9a5a48, 0x3a120c);
        g.scale.multiplyScalar(0.9);
        setFlames(g, 0.8);
      }
      g.position.set(e[2], e[3], e[4]);
      Object.assign(g.userData, { id: e[0], kind: e[1] ? "tank" : "plane", ghost: true, velocity: new THREE.Vector3(), goal: new THREE.Vector3(), fire: 2, dodge: 1, tp: new THREE.Vector3(), turn: 0, heading: 0 });
      scene.add(g);
      enemies.push(g);
    }
    g.userData.tp.set(e[2], e[3], e[4]);
    g.userData.ty = e[5];
    g.userData.tpi = e[6];
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (ids.has(enemies[i].userData.id)) continue;
    explode(enemies[i].position, 2);
    destroyEnemy(enemies[i], false);
  }
  for (const b of pr.B || []) if (b[0] > lastBolt) { lastBolt = b[0]; makeBolt(b); }
  for (const k of pr.K || []) if (k[0] > lastKill) { lastKill = k[0]; if (k[2] === myPeer) creditKill(!!k[1]); }
}
function respawn() {
  hp = 100;
  down = false;
  lastHitBy = "";
  player.visible = true;
  gloc = 0;
  blood = 1;
  speed = 42;
  gLoad = 1;
  player.position.set(rand(-ARENA * 0.6, ARENA * 0.6), 90, rand(-ARENA * 0.6, ARENA * 0.6));
  yaw = yawT = rand(0, 6.28);
  pitch = pitchT = 0.1;
  roll = 0;
  gReady = false;
  hpEl.textContent = "Coque 100";
}
function netTick(dt) {
  if (!net) return;
  let me = null;
  let host = "~";
  const peers = net.peers();
  for (const p of peers) {
    if (p.kind !== "viewer") continue;
    if (p.sameTab) me = p;
    if (p.peer < host) host = p.peer;
  }
  if (!me) return;
  myPeer = me.peer;
  hostLabel = host;
  const hostNow = host === myPeer;
  if (hostNow !== wasHost) {
    wasHost = hostNow;
    lastBolt = 0;
    lastKill = 0;
    if (hostNow) for (const e of enemies) e.userData.ghost = false;
    else {
      for (const e of enemies) scene.remove(e);
      enemies.length = 0;
    }
  }
  const seen = new Set();
  for (const p of peers) {
    if (p.kind !== "viewer" || p.isMe) continue;
    const pr = p.presence;
    seen.add(p.peer);
    let r = remotes.get(p.peer);
    if (!r) {
      r = { mesh: makeCraft("player", peerColor(p.peer), 0x0b1218), lastF: 0, dc: pr.dc | 0, dead: 0, pr };
      r.mesh.userData.remote = true;
      r.mesh.userData.peer = p.peer;
      if (pr.p) r.mesh.position.fromArray(pr.p);
      scene.add(r.mesh);
      remotes.set(p.peer, r);
    }
    r.pr = pr;
    if (pr.p) r.mesh.position.lerp(tmp.fromArray(pr.p), 1 - Math.exp(-12 * dt));
    if (pr.r) {
      euler.set(pr.r[1], pr.r[0], pr.r[2]);
      lookQ.setFromEuler(euler);
      r.mesh.quaternion.slerp(lookQ, 1 - Math.exp(-12 * dt));
    }
    setFlames(r.mesh, 1);
    const dd = pr.d ? 1 : 0;
    if (dd && !r.dead) {
      explode(r.mesh.position, 3);
      spawnDebris(r.mesh.position, 14, 0x8fa7b8);
    }
    r.dead = dd;
    r.mesh.visible = !dd;
    if ((pr.dc | 0) > r.dc) {
      r.dc = pr.dc | 0;
      if (mode === "pvp" && pr.kb === myPeer) {
        kills++;
        score += 200;
        scoreEl.textContent = `Score ${score}`;
      }
    }
    for (const f of pr.f || []) {
      if (f[0] > (r.lastF || 0)) {
        r.lastF = f[0];
        spawnRemoteMissile(p.peer, f);
      }
    }
    if (p.peer === host && !hostNow && pr.E) syncGhosts(pr);
  }
  for (const [k, r] of remotes) {
    if (seen.has(k)) continue;
    scene.remove(r.mesh);
    remotes.delete(k);
  }
  sendT -= dt;
  if (sendT <= 0) {
    sendT = 0.066;
    const patch = {
      p: [r1(player.position.x), r1(player.position.y), r1(player.position.z)],
      r: [r2(yaw), r2(pitch), r2(roll)],
      h: hp, d: down ? 1 : 0, sc: score, k: kills, dc: deaths, kb: deathBy, f: fireLog.slice(),
      E: null, B: null, K: null,
    };
    if (hostNow) {
      patch.E = enemyList();
      patch.B = boltLog.slice();
      patch.K = killLog.slice();
      patch.w = wave;
    }
    net.presence(patch).catch(() => {});
  }
  boardT -= dt;
  if (boardT <= 0) {
    boardT = 0.5;
    let s = `${mode.toUpperCase()}${hostNow ? " · hôte" : ""}\nToi  ${score} pts · ${kills} frags · ${Math.max(0, hp)} hp`;
    for (const [k, r] of remotes) s += `\n${k.slice(-3)}  ${r.pr.sc | 0} pts · ${r.pr.k | 0} frags · ${r.pr.h | 0} hp`;
    board.textContent = s;
  }
}
async function startNet(m) {
  netMsg.textContent = "Connexion…";
  try {
    const room = window.claude && (await window.claude.use("room"));
    if (!room) throw new Error("room");
    const name = (codeEl.value || "salon1").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "salon1";
    net = await room.join(m + "-" + name);
  } catch (e) {
    net = null;
    netMsg.textContent = "Multijoueur indisponible ici : ouvre la page depuis claude.ai, connecté (membre ou invité).";
    return;
  }
  mode = m;
  for (const e of enemies) scene.remove(e);
  enemies.length = 0;
  wave = 0;
  netJoined = performance.now();
  board.style.display = "block";
  overlay.hidden = true;
  hud.hidden = false;
  running = true;
  canvas.requestPointerLock();
}
document.querySelector("#coop").addEventListener("click", () => startNet("coop"));
document.querySelector("#pvp").addEventListener("click", () => startNet("pvp"));

function AudioBus() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  return {
    blip(freq, duration) {
      if (!Ctx) return;
      if (!ctx) ctx = new Ctx();
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "square";
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    },
    boom(vol = 1) {
      if (!Ctx) return;
      if (!ctx) ctx = new Ctx();
      if (ctx.state === "suspended") ctx.resume();
      const len = Math.floor(ctx.sampleRate * 0.7);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 700;
      const gain = ctx.createGain();
      gain.gain.value = 0.25 * vol;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
    },
  };
}

