var noise = new SimplexNoise();
var audio = new Audio();
var play = false;
var context, src, analyser, bufferLength, dataArray;
var renderer, scene, camera, ball, group;
var capturer, frames = [];
var ffmpeg;

document.getElementById('playPauseButton').addEventListener('click', () => {
    if (isPlaying(audio)) {
        audio.pause();
        document.getElementById('playPauseButton').innerText = 'Play';
    } else {
        audio.play();
        document.getElementById('playPauseButton').innerText = 'Pause';
    }
});

document.getElementById('renderButton').addEventListener('click', async () => {
    console.log("Render button clicked");
    await startRecording();
});

document.getElementById('fileInput').addEventListener('change', function(event) {
    var file = event.target.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
        audio.src = e.target.result;
        audio.load();
    };
    reader.readAsDataURL(file);
    audio.addEventListener('play', () => {
        if (!context) {
            startViz();
        }
    });
});

function isPlaying(audioIn) {
    return !audioIn.paused;
}

async function startRecording() {
    // Create a new MediaRecorder instance to record canvas stream
    const stream = renderer.domElement.captureStream();
    const recorder = new MediaRecorder(stream);

    // Prepare data chunks to store the recorded frames
    recorder.ondataavailable = function(e) {
        frames.push(e.data);
    };

    // Start recording
    recorder.start();

    // Stop recording after audio finishes
    audio.addEventListener('ended', function() {
        recorder.stop();
        recorder.ondataavailable = null;
        recorder.onstop = saveRecording;
    });
}

async function saveRecording() {
    // Convert frames to a single Blob
    const blob = new Blob(frames, { type: 'video/webm' });

    // Download the recording or handle as needed
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'spectrum.webm';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);

    frames = [];
}

function startViz() {
    //audio analyzer setup
    context = new AudioContext();
    src = context.createMediaElementSource(audio);
    analyser = context.createAnalyser();
    src.connect(analyser);
    analyser.connect(context.destination);
    analyser.fftSize = 512;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    //webgl
    scene = new THREE.Scene();
    group = new THREE.Group();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 100;
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor("#000000");

    document.body.appendChild(renderer.domElement);

    var geometry = new THREE.IcosahedronGeometry(20, 1);

    var material = new THREE.ShaderMaterial({
        uniforms: {
            color1: { value: new THREE.Color("#ffffff") },
            color2: { value: new THREE.Color("#ffffff") }
        },
        vertexShader: `
          varying vec2 vUv;
      
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 color1;
          uniform vec3 color2;
          
          varying vec2 vUv;
          
          void main() {
            gl_FragColor = vec4(mix(color1, color2, vUv.y), 1.0);
          }
        `,
        wireframe: true
    });

    ball = new THREE.Mesh(geometry, material);
    ball.position.set(0, 0, 0);

    group.add(ball);
    scene.add(group);

    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    });

    render();
}

function render() {
    analyser.getByteFrequencyData(dataArray);

    var lowerHalfArray = dataArray.slice(0, (dataArray.length / 2) - 1);
    var upperHalfArray = dataArray.slice((dataArray.length / 2) - 1, dataArray.length - 1);

    var overallAvg = avg(dataArray);
    var lowerMax = max(lowerHalfArray);
    var lowerAvg = avg(lowerHalfArray);
    var upperMax = max(upperHalfArray);
    var upperAvg = avg(upperHalfArray);

    var lowerMaxFr = lowerMax / lowerHalfArray.length;
    var lowerAvgFr = lowerAvg / lowerHalfArray.length;
    var upperMaxFr = upperMax / upperHalfArray.length;
    var upperAvgFr = upperAvg / upperHalfArray.length;

    ball.rotation.x += 0.001;
    ball.rotation.y += 0.005;
    ball.rotation.z += 0.002;

    WarpBall(ball, modulate(Math.pow(lowerMaxFr, 0.8), 0, 1, 0, 12), modulate(upperAvgFr, 0, 1, 0, 6));

    renderer.render(scene, camera);

    requestAnimationFrame(render);
}

function WarpBall(mesh, bassFr, treFr) {
    mesh.geometry.vertices.forEach(function(vertex, i) {
        var offset = mesh.geometry.parameters.radius;
        var amp = 8; // Increased amplitude for more impact
        var time = window.performance.now();
        vertex.normalize();
        var rf = 0.00001;
        var distance = (offset + bassFr) + noise.noise3D(vertex.x + time * rf * 6, vertex.y + time * rf * 7, vertex.z + time * rf * 8) * amp * treFr;
        vertex.multiplyScalar(distance);
    });
    mesh.geometry.verticesNeedUpdate = true;
    mesh.geometry.normalsNeedUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeFaceNormals();
}

//helper functions
function fractionate(val, minVal, maxVal) {
    return (val - minVal) / (maxVal - minVal);
}

function modulate(val, minVal, maxVal, outMin, outMax) {
    var fr = fractionate(val, minVal, maxVal);
    var delta = outMax - outMin;
    return outMin + (fr * delta);
}

function avg(arr) {
    var total = arr.reduce(function(sum, b) { return sum + b; });
    return (total / arr.length);
}

function max(arr) {
    return arr.reduce(function(a, b) { return Math.max(a, b); })
}
