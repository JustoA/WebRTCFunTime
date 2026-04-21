let ws;
let audioTrack;
let started = false;
let myId;
const peers = new Map(); // peerId -> RTCPeerConnection
let COTURN_IP = "192.168.198.130";
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("start");
let stream = null;

function createPeer(peerId, stream) {
    console.log("Creating peer: " + peerId);
    // peer connection. Not sure if I have the TURN set up correctly right now. Should have coturn running on the ip here.
    pc = new RTCPeerConnection(null);
    // get the user's tracks, and add them all to the peer connection.
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // when we get a track from the server
    pc.ontrack = (event) => {
        //play it!
        const audio = new Audio();
        audio.srcObject = event.streams[0];

        // thx https://stackoverflow.com/questions/71268739/how-do-i-catch-an-audio-domexception-caused-by-a-file-that-cannot-play

        audio.play().catch(() => {
            console.log("Autoplay blocked until interaction");
        });
    };
    // browser will try to find potential candidates for communication
    pc.onicecandidate = (event) => {
        // send the candidate over to the server for distribution
        if (event.candidate) {
            // debug to make sure own stun / turn / ice is being used
            console.log(event.candidate.candidate);
            ws.send(JSON.stringify({
                to: peerId,
                from: myId,
                candidate: event.candidate
            }));
        }
    };
    peers.set(peerId, pc);
    return pc;
}

async function startConnection(peerId, isInitiator, stream) {
    const pc = createPeer(peerId, stream);

    if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        ws.send(JSON.stringify({
            to: peerId,
            from: myId,
            offer
        }));
    }

    return pc;
}

startBtn.onclick = async () => {
    startBtn.disabled = true;
    started = true;

    // get user audio
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioTrack = stream.getAudioTracks()[0];
    //start muted!
    audioTrack.enabled = false;
    // open a websocket connection to the backend

    ws = new WebSocket(`ws://${location.host}/ws`);

    // once its ready, tell user we are connected
    ws.onopen = () => {
        statusEl.textContent = "Connected";
        ws.send('{"initplease": "true"}')
    };

    // we got data from the server. What the heck is it?
    ws.onmessage = async (msg) => {
        if (!stream){
            console.log("Error: stream not initialized!")
        }
        const data = JSON.parse(msg.data);
        console.log(data);
        // if its init, note down our id.
        if (data.type == "init") {
            myId = data.id;
            // connect to all the peers
            for (const peerId of data.peers) {
                let pc = await startConnection(peerId, true, stream);
                peers.set(peerId, pc)
            }
        }
        // could be a connection offer. We should answer it.
        if (data.offer) {
            console.log("Got offer")
            if (data.from) {
                console.log("From: " + data.from)
                const pc = createPeer(data.from, stream);

                await pc.setRemoteDescription(data.offer);

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                ws.send(JSON.stringify({ to: data.from,
                    from: myId,
                     answer }));
            }
        }
        // if we got an answer, note it down
        if (data.answer) {
            const pc = peers.get(data.from)
            if (pc){
            await pc.setRemoteDescription(data.answer);
            }
            else{
                console.log("Error: Couldn't find peer "+ data.from +" in active list of peers!")
                console.log(peers)
            }
        }
        // same for candidates
        if (data.candidate) {
            const pc = peers.get(data.from);
            await pc.addIceCandidate(data.candidate);
        }
    };

    // Create offer after WS is ready

    statusEl.textContent = "Ready (hold space to talk)";
};

// Push-to-talk
let talking = false;

window.addEventListener("keydown", (e) => {
    if (!started) return;

    if (e.code === "Space" && !talking) {
        audioTrack.enabled = true;
        talking = true;
        statusEl.textContent = "Talking...";
    }
});

window.addEventListener("keyup", (e) => {
    if (!started) return;

    if (e.code === "Space") {
        audioTrack.enabled = false;
        talking = false;
        statusEl.textContent = "Ready (hold space to talk)";
    }
});

async function getStats() {
    if (!peers) return;
    const pc = Array.from(peers.values)[0];

    const stats = await pc.getStats();
    let result = {};

    stats.forEach(report => {
        // Outbound (what we send)
        if (report.type === "outbound-rtp" && report.kind === "audio") {
            result.packetsSent = report.packetsSent;
            result.bytesSent = report.bytesSent;
        }

        // Inbound (what we receive)
        if (report.type === "inbound-rtp" && report.kind === "audio") {
            result.packetsReceived = report.packetsReceived;
            result.packetsLost = report.packetsLost;
            result.jitter = report.jitter;
            result.bytesReceived = report.bytesReceived;
        }

        // Connection-level stats (latency)
        if (report.type === "candidate-pair" && report.state === "succeeded") {
            result.rtt = report.currentRoundTripTime;
        }
    });

    return result;
}
// const statsEl = document.getElementById("stats");

// setInterval(async () => {
//     const stats = await getStats();
//     if (!stats) return;

//     statsEl.textContent = `
//     Packets Sent:     ${stats.packetsSent ?? 0}
//     Packets Received: ${stats.packetsReceived ?? 0}
//     Packets Lost:     ${stats.packetsLost ?? 0}
//     RTT (Latency):    ${(stats.rtt * 1000).toFixed(1)} ms
//     Jitter:           ${stats.jitter?.toFixed(4)}
//     `;
// }, 1000);