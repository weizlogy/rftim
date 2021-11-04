var iconimg;
var isIconimgLoaded = false;
var isStart = false;

var expConfig = {
  isShow: false,
  text: '',
  x: 0,
  y: 0,
  size: 30,
  isEmoticon: false,
  talkingthreshold: 10,
  rtawkey: '',
};

var detectionBox;
var expression;
var landmark;

window.addEventListener('DOMContentLoaded', async function() {
  console.log('DOMContentLoaded.');

  console.log('register eventlisteners');
  document.querySelector('input[name="settings-debug"]').onchange = (e) => {
    let style = '0';
    if (e.target.checked) {
      style = '0.9';
    }
    document.querySelector('div[name="debug"] > video').style.opacity = style;
    document.querySelector('div[name="debug-score"]').style.opacity = style;
    document.querySelector('div[name="debug-landmark"]').style.opacity = style;
    if (isStart) {
      document.querySelector('canvas[name="score"]').style.opacity = style;
    }
  };
  document.querySelector('input[name="settings-fps"]').onchange = (e) => {
    fpsRunning = !fpsRunning;
    FrameRate(document.querySelector('div[name="debug-fps"]'));
  };
  document.querySelector('input[name="settings-bk-color"]').onchange = (e) => {
    document.querySelector('#icon-view').style.backgroundColor = e.target.value;
  };
  document.querySelector('input[name="settings-show-exp-txt"]').onchange = (e) => {
    expConfig.isShow = e.target.checked;
  };
  document.querySelector('input[name="settings-use-emoticon"]').onchange = (e) => {
    expConfig.isEmoticon = e.target.checked;
  };
  document.querySelector('input[name="settings-exp-x"]').onchange = (e) => {
    expConfig.x = parseFloat(e.target.value, 10);
    if (isNaN(expConfig.x)) {
      expConfig.x = 0;
    }
  };
  document.querySelector('input[name="settings-exp-y"]').onchange = (e) => {
    expConfig.y = parseFloat(e.target.value, 10);
    if (isNaN(expConfig.y)) {
      expConfig.y = 0;
    }
  };
  document.querySelector('input[name="settings-exp-size"]').onchange = (e) => {
    expConfig.size = parseFloat(e.target.value, 10);
    if (isNaN(expConfig.size)) {
      expConfig.size = 30;
      return;
    }
    document.querySelector('#expression-view').height = expConfig.size + 10;
  };
  document.querySelector('input[name="settings-exp-talking-threshold"]').onchange = (e) => {
    expConfig.talkingthreshold = parseFloat(e.target.value, 10);
    if (isNaN(expConfig.talkingthreshold)) {
      expConfig.talkingthreshold = 10;
    }
  };
  document.querySelector('input[name="settings-exp-rtaw-key"]').onchange = (e) => {
    expConfig.rtawkey = e.target.value;
  };

  const file = document.querySelector('input[name="settings-image"]');
  file.addEventListener('change', (e) => {
    const reader = new FileReader();
    reader.onload = function(event) {
      iconimg = new Image();
      iconimg.onload = function() {
        const canvas = document.querySelector('#icon-view');
        canvas.width = iconimg.width * 2;
        canvas.height = iconimg.height * 2;
        const expcanvas = document.querySelector('#expression-view');
        expcanvas.width = canvas.width;
        expcanvas.height = canvas.height;
        isIconimgLoaded = true;
        if (isStart) {
          return;
        }
        detectStart();
        isStart = true;
      }
      iconimg.src = event.target.result;
    }
    reader.readAsDataURL(e.target.files[0]);
  });
});

window.addEventListener('load', function() {
  console.log('load.');

  document.querySelectorAll('input, select').forEach((element) => {
    if (element.type == 'file') {
      return;
    }
    let store = localStorage;
    const storageItem = store.getItem(element.name);
    if (storageItem) {
      if (element.type == 'checkbox' && storageItem) {
        element.checked = storageItem.toLowerCase() === 'true';
      } else {
        element.value = storageItem;
      }
      element.dispatchEvent(new Event('change'));
    }
    element.addEventListener('change', function(event) {
      if (element.type == 'checkbox') {
        localStorage.setItem(event.target.name, event.target.checked);
        return;
      }
      localStorage.setItem(event.target.name, event.target.value);
    });
  });
});

async function detectStart() {
  console.log('load models.');
  await faceapi.loadTinyFaceDetectorModel('/lib/models');
  await faceapi.loadFaceExpressionModel('/lib/models');
  await faceapi.loadFaceLandmarkModel('/lib/models');

  console.log('start webcam.');
  const video = document.querySelector('#debug-video');
  video.srcObject = await navigator.mediaDevices.getUserMedia( { audio: false, video: { zoom: true } });

  // ZOOM機能判定
  const zoomslider = document.querySelector('input[name="settings-zoom"]')
  const [track] = video.srcObject.getVideoTracks();
  const capabilities = track.getCapabilities();
  const settings = track.getSettings();
  if ('zoom' in settings) {
    zoomslider.min = capabilities.zoom.min;
    zoomslider.max = capabilities.zoom.max;
    zoomslider.step = capabilities.zoom.step;
    zoomslider.value = settings.zoom;
    zoomslider.oninput = function(event) {
      track.applyConstraints({advanced: [ {zoom: event.target.value} ]});
    }
  }

  video.addEventListener('play', async () => {
    console.log('create canvas.');
    const canvas = faceapi.createCanvasFromMedia(video);
    canvas.setAttribute('name', 'score');
    document.querySelector('div[name="debug"]').append(canvas);

    console.log('start detection.');
    requestAnimationFrame(detectMyFace);
    requestAnimationFrame(drawIcon);
    requestAnimationFrame(drawExpression);
    requestAnimationFrame(drawLandmark);
  });
}

async function detectMyFace() {
  // 認識用
  const video = document.querySelector('#debug-video');
  const canvas = document.querySelector('canvas[name="score"]');
  const expAngry = document.querySelector('div[name="debug-expression-angry"] > span');
  const expDisgusted = document.querySelector('div[name="debug-expression-disgusted"] > span');
  const expFearful = document.querySelector('div[name="debug-expression-fearful"] > span');
  const expHappy = document.querySelector('div[name="debug-expression-happy"] > span');
  const expNeutral = document.querySelector('div[name="debug-expression-neutral"] > span');
  const expSad = document.querySelector('div[name="debug-expression-sad"] > span');
  const expSurprised = document.querySelector('div[name="debug-expression-surprised"] > span');

  const displaySize = { width: video.width, height: video.height };

  const detections = await faceapi.detectSingleFace(
    video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceExpressions();

  if (!detections) {
    requestAnimationFrame(detectMyFace);
    return;
  }

  detectionBox = detections['detection']['box'];
  expression = detections['expressions'];
  landmark = detections['landmarks'];

  //** tetetetetetetetetetete */
  // console.log(detections);
  
  expAngry.textContent = detections['expressions']['angry'];
  expDisgusted.textContent = detections['expressions']['disgusted'];
  expFearful.textContent = detections['expressions']['fearful'];
  expHappy.textContent = detections['expressions']['happy'];
  expNeutral.textContent = detections['expressions']['neutral'];
  expSad.textContent = detections['expressions']['sad'];
  expSurprised.textContent = detections['expressions']['surprised'];

  const detectionsForSize = faceapi.resizeResults(detections, displaySize);
  faceapi.matchDimensions(canvas, displaySize);
  faceapi.draw.drawDetections(canvas, detectionsForSize, 0.05);
  faceapi.draw.drawFaceLandmarks(canvas, detectionsForSize);

  requestAnimationFrame(detectMyFace);
}

function drawIcon() {
  const file = document.querySelector('input[name="settings-image"]');
  const canvas = document.querySelector('#icon-view');
  const ctx = canvas.getContext('2d');

  if (file.files.length == 0 || !isIconimgLoaded) {
    requestAnimationFrame(drawIcon);
    return;
  }

  if (detectionBox) {
    let x = 0;
    let y = 0;
    ctx.clearRect(0, 0, iconimg.width, iconimg.height);
    ctx.drawImage(iconimg, x, y);

    if (expConfig.isShow) {
      const expcanvas = document.querySelector('#expression-view');
      const expctx = expcanvas.getContext('2d');
      const oldex = expConfig.x + expcanvas.width / 2;
      const oldey = expConfig.y - expConfig.size;
      const oldew = expConfig.text.length * expConfig.size;
      const oldeh = expConfig.size * 1.5;
      expctx.clearRect(oldex, oldey, oldew * 2, oldeh);
      expctx.font = "bold " + expConfig.size + "px sans-serif";
      expctx.translate(0, 0);
      expctx.fillText(expConfig.text, oldex, expConfig.y);
      expctx.strokeText(expConfig.text, oldex, expConfig.y);
      // expctx.strokeRect(oldex, oldey, oldew, oldeh); ////クリア範囲確認用
    }
  }

  requestAnimationFrame(drawIcon);
}

function drawExpression() {
  if (!expression) {
    requestAnimationFrame(drawExpression);
    return;
  }

  const temp = Object.entries(expression);
  temp.sort((c1, c2) => {
    return c2[1] - c1[1]
  });
  const key = temp[0][0];
  const strength = temp[0][1];
  if (key == 'neutral' || strength < 0.7) {
    expConfig.text = '  ';
    requestAnimationFrame(drawExpression);
    if (isTalking) {
      expConfig.text = '💭';
    }
    if (expConfig.rtawkey) {
      RTAWRelation('neutral', 0);
    }
    return;
  }
  // console.log(temp[0][0], temp[0][1]);
  if (expConfig.isEmoticon) {
    switch (key) {
      case 'angry':
        expConfig.text = '💢';
        break;
      case 'disgusted':
        expConfig.text = '💫';
        break;
      case 'fearful':
        expConfig.text = '🖤';
        break;
      case 'happy':
        expConfig.text = '💞';
        break;
      case 'sad':
        expConfig.text = '💧';
        break;
      case 'surprised':
        expConfig.text = '❗';
        break;
    }    
  } else {
    expConfig.text = key + ' ' + '!'.repeat(Math.round(strength * 10) / 3);
  }
  if (isTalking) {
    expConfig.text = '💭+' + expConfig.text;
  }
  if (expConfig.rtawkey) {
    RTAWRelation(key, strength);
  }

  requestAnimationFrame(drawExpression);
}

var isTalking = false;
function drawLandmark() {
  if (!landmark) {
    requestAnimationFrame(drawLandmark);
    return;
  }

  const mouth = landmark.getMouth();

  // mouthの14と18のY座標差でトーク判定
  if (mouth[18].y - mouth[14].y > expConfig.talkingthreshold) {
    document.querySelector('div[name="debug-landmark-mouth-move"]').textContent =
      'talking ' + (mouth[18].y - mouth[14].y);
    isTalking = true;
  } else {
    document.querySelector('div[name="debug-landmark-mouth-move"]').textContent =
      (mouth[18].y - mouth[14].y);
    isTalking = false;
  }

  requestAnimationFrame(drawLandmark);
}

// FPS
var fps = 0;
var fpsRunning = false;
function FrameRate(element) {
  const output = element;
  let st, et, d, count = 0, max = 30, fps = 0;
  const counter = function() {
    count++;
    if(count === 1) {
      st = new Date().getTime();
    }
    if(count === max) {
      et = new Date().getTime();
      d = et - st;
      fps = count / d * 1000;
      count = 0;
      output.textContent = Math.round(fps);
    }
    if (!fpsRunning) {
      return;
    }
    requestAnimationFrame(counter);
  };
  if (!fpsRunning) {
    return;
  }
  requestAnimationFrame(counter);
}

var socket = null;
var oldemote = '';
function RTAWRelation(emotion, strength) {
  const mysender = () => {
    if (oldemote == emotion) {
      return;
    }
    oldemote = emotion;
    const data = `{ "to": "${expConfig.rtawkey}", "emotion": "${emotion}", "strength": "${strength}" }`;
    socket.send(data);
  };
  if (!socket) {
    socket = new WebSocket(`wss://cloud.achex.ca/rtaw${expConfig.rtawkey}`);

    socket.addEventListener('open', (ev) => {
      socket.send(`{ "auth": "${expConfig.rtawkey}sender" }`);
      mysender();
    });
    socket.addEventListener('message', (ev) => {
      console.log(ev.data);
    });
    return;
  }
  if (socket.readyState == 1) {
    mysender();
  }
}
