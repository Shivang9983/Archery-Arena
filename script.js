const svg = document.querySelector("#game");
const cursor = svg.createSVGPoint();
const arrows = document.querySelector(".arrows");
const aimHint = document.querySelector("#aimHint");
const feedback = document.querySelector("#feedback");
const scoreValue = document.querySelector("#scoreValue");
const shotsValue = document.querySelector("#shotsValue");
const bullseyeValue = document.querySelector("#bullseyeValue");
const restartBtn = document.querySelector("#restartBtn");

const target = { x: 900, y: 249.5 };
const lineSegment = { x1: 875, y1: 280, x2: 925, y2: 220 };
const pivot = { x: 100, y: 250 };

const state = {
  score: 0,
  shots: 0,
  bullseyes: 0,
  activePointerId: null,
  randomAngle: 0,
  feedbackTimer: null
};

updateHud();
setIdleAim();

svg.addEventListener("pointerdown", startDraw);
restartBtn.addEventListener("click", restartRound);

function startDraw(event) {
  if (state.activePointerId !== null) {
    return;
  }

  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  state.activePointerId = event.pointerId;
  state.randomAngle = Math.random() * Math.PI * 0.03 - 0.015;

  if (svg.setPointerCapture) {
    svg.setPointerCapture(event.pointerId);
  }

  TweenMax.to(".arrow-angle use", 0.2, { opacity: 1 });

  aimHint.textContent = "Release when the bow feels lined up.";

  window.addEventListener("pointermove", aimArrow);
  window.addEventListener("pointerup", releaseArrow);
  window.addEventListener("pointercancel", releaseArrow);

  aimArrow(event);
}

function aimArrow(event) {
  if (
    state.activePointerId !== null &&
    event.pointerId !== undefined &&
    event.pointerId !== state.activePointerId
  ) {
    return;
  }

  const point = getSvgPoint(event);
  point.x = Math.min(point.x, pivot.x - 7);
  point.y = Math.max(point.y, pivot.y + 7);

  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  const angle = Math.atan2(dy, dx) + state.randomAngle;
  const bowAngle = angle - Math.PI;
  const distance = Math.min(Math.hypot(dx, dy), 50);
  const scale = Math.min(Math.max(distance / 30, 1), 2);

  TweenMax.to("#bow", 0.2, {
    scaleX: scale,
    rotation: `${bowAngle}rad`,
    transformOrigin: "right center"
  });

  TweenMax.to(".arrow-angle", 0.2, {
    rotation: `${bowAngle}rad`,
    svgOrigin: "100 250"
  });

  TweenMax.to(".arrow-angle use", 0.2, {
    x: -distance
  });

  TweenMax.to("#bow polyline", 0.2, {
    attr: {
      points: `88,200 ${Math.min(pivot.x - distance / scale, 88)},250 88,300`
    }
  });

  const radius = distance * 9;
  const offsetX = Math.cos(bowAngle) * radius;
  const offsetY = Math.sin(bowAngle) * radius;
  const arcWidth = offsetX * 3;

  TweenMax.to("#arc", 0.2, {
    attr: {
      d: `M100,250c${offsetX},${offsetY},${arcWidth - offsetX},${offsetY + 50},${arcWidth},50`
    },
    autoAlpha: distance / 60
  });
}

function releaseArrow(event) {
  if (
    state.activePointerId !== null &&
    event.pointerId !== undefined &&
    event.pointerId !== state.activePointerId
  ) {
    return;
  }

  stopPointerTracking();

  state.shots += 1;
  updateHud();

  TweenMax.to("#bow", 0.35, {
    scaleX: 1,
    transformOrigin: "right center",
    ease: Elastic.easeOut
  });

  TweenMax.to("#bow polyline", 0.35, {
    attr: { points: "88,200 88,250 88,300" },
    ease: Elastic.easeOut
  });

  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "use");
  arrow.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#arrow");
  arrows.appendChild(arrow);

  keepArrowTrailSmall();

  const path = MorphSVGPlugin.pathDataToBezier("#arc");

  TweenMax.to(arrow, 0.5, {
    force3D: true,
    bezier: {
      type: "cubic",
      values: path,
      autoRotate: ["x", "y", "rotation"]
    },
    onUpdate: checkHit,
    onUpdateParams: ["{self}"],
    onComplete: handleMiss,
    onCompleteParams: ["{self}"],
    ease: Linear.easeNone
  });

  TweenMax.to("#arc", 0.2, { opacity: 0 });
  TweenMax.set(".arrow-angle use", { opacity: 0 });

  aimHint.textContent = "Take another shot.";
}

function checkHit(tween) {
  const arrow = tween.target;

  if (arrow.dataset.done === "true") {
    return;
  }

  const transform = arrow._gsTransform;
  const radians = (transform.rotation * Math.PI) / 180;
  const arrowSegment = {
    x1: transform.x,
    y1: transform.y,
    x2: transform.x + Math.cos(radians) * 60,
    y2: transform.y + Math.sin(radians) * 60
  };

  const intersection = getIntersection(arrowSegment, lineSegment);

  if (!intersection || !intersection.segment1 || !intersection.segment2) {
    return;
  }

  arrow.dataset.done = "true";
  tween.pause();

  const dx = intersection.x - target.x;
  const dy = intersection.y - target.y;
  const distance = Math.hypot(dx, dy);
  const isBullseye = distance < 7;

  state.score += isBullseye ? 100 : 35;
  if (isBullseye) {
    state.bullseyes += 1;
  }

  updateHud();
  showWord(isBullseye ? ".bullseye" : ".hit");
  showFeedback(isBullseye ? "Bullseye! +100" : "Hit! +35", isBullseye ? "bullseye" : "hit");
  aimHint.textContent = isBullseye
    ? "Perfect shot. Go again."
    : "Nice hit. Try for the center.";
}

function handleMiss(tween) {
  const arrow = tween.target;

  if (arrow.dataset.done === "true") {
    return;
  }

  arrow.dataset.done = "true";
  showWord(".miss");
  showFeedback("Missed", "miss");
  aimHint.textContent = "Missed that one. Adjust and try again.";
}

function showWord(selector) {
  TweenMax.killTweensOf(selector);
  TweenMax.killChildTweensOf(selector);

  TweenMax.set(selector, { autoAlpha: 1 });
  TweenMax.staggerFromTo(
    `${selector} path`,
    0.45,
    {
      scale: 0,
      rotation: -6,
      transformOrigin: "center"
    },
    {
      scale: 1,
      ease: Back.easeOut
    },
    0.04
  );

  TweenMax.staggerTo(
    `${selector} path`,
    0.25,
    {
      delay: 1.6,
      scale: 0,
      rotation: 16,
      ease: Back.easeIn
    },
    0.03
  );
}

function showFeedback(message, tone) {
  clearTimeout(state.feedbackTimer);
  feedback.textContent = message;
  feedback.className = `feedback ${tone}`;

  state.feedbackTimer = window.setTimeout(() => {
    feedback.textContent = "";
    feedback.className = "feedback";
  }, 1600);
}

function updateHud() {
  scoreValue.textContent = state.score;
  shotsValue.textContent = state.shots;
  bullseyeValue.textContent = state.bullseyes;
}

function keepArrowTrailSmall() {
  while (arrows.childNodes.length > 10) {
    arrows.removeChild(arrows.firstChild);
  }
}

function restartRound() {
  state.score = 0;
  state.shots = 0;
  state.bullseyes = 0;
  state.randomAngle = 0;

  stopPointerTracking();
  clearTimeout(state.feedbackTimer);

  arrows.innerHTML = "";
  feedback.textContent = "";
  feedback.className = "feedback";
  aimHint.textContent = "Drag or touch the game area to aim. Release to shoot.";

  TweenMax.set([".miss", ".bullseye", ".hit"], { autoAlpha: 0 });
  TweenMax.set(".arrow-angle use", { opacity: 1, x: 0 });
  TweenMax.set("#bow", {
    scaleX: 1,
    rotation: 0,
    transformOrigin: "right center"
  });
  TweenMax.set("#bow polyline", {
    attr: { points: "88,200 88,250 88,300" }
  });
  TweenMax.set("#arc", { opacity: 0 });

  updateHud();
  setIdleAim();
}

function setIdleAim() {
  aimArrow({
    clientX: 320,
    clientY: 300
  });
}

function stopPointerTracking() {
  window.removeEventListener("pointermove", aimArrow);
  window.removeEventListener("pointerup", releaseArrow);
  window.removeEventListener("pointercancel", releaseArrow);

  if (svg.releasePointerCapture && state.activePointerId !== null) {
    try {
      svg.releasePointerCapture(state.activePointerId);
    } catch (error) {
      // Pointer capture can already be gone on some devices.
    }
  }

  state.activePointerId = null;
}

function getSvgPoint(event) {
  cursor.x = event.clientX;
  cursor.y = event.clientY;
  return cursor.matrixTransform(svg.getScreenCTM().inverse());
}

function getIntersection(first, second) {
  const dx1 = first.x2 - first.x1;
  const dy1 = first.y2 - first.y1;
  const dx2 = second.x2 - second.x1;
  const dy2 = second.y2 - second.y1;
  const cx = first.x1 - second.x1;
  const cy = first.y1 - second.y1;
  const denominator = dy2 * dx1 - dx2 * dy1;

  if (denominator === 0) {
    return null;
  }

  const ua = (dx2 * cy - dy2 * cx) / denominator;
  const ub = (dx1 * cy - dy1 * cx) / denominator;

  return {
    x: first.x1 + ua * dx1,
    y: first.y1 + ua * dy1,
    segment1: ua >= 0 && ua <= 1,
    segment2: ub >= 0 && ub <= 1
  };
}
