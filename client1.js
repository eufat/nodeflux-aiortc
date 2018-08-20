var pc = new RTCPeerConnection();

// get DOM elements
var dataChannelLog = document.getElementById("data-channel"),
    iceConnectionLog = document.getElementById("ice-connection-state"),
    iceGatheringLog = document.getElementById("ice-gathering-state"),
    signalingLog = document.getElementById("signaling-state");

// register some listeners to help debugging
pc.addEventListener(
    "icegatheringstatechange",
    function() {
        iceGatheringLog.textContent += " -> " + pc.iceGatheringState;
    },
    false
);
iceGatheringLog.textContent = pc.iceGatheringState;

pc.addEventListener(
    "iceconnectionstatechange",
    function() {
        iceConnectionLog.textContent += " -> " + pc.iceConnectionState;
    },
    false
);
iceConnectionLog.textContent = pc.iceConnectionState;

pc.addEventListener(
    "signalingstatechange",
    function() {
        signalingLog.textContent += " -> " + pc.signalingState;
    },
    false
);
signalingLog.textContent = pc.signalingState;

pc.addEventListener("track", function(evt) {
    if (evt.track.kind == "video")
        document.getElementById("video").srcObject = evt.streams[0];
    else document.getElementById("audio").srcObject = evt.streams[0];
});

// data channel
var dc = null,
    dcInterval = null;

function negotiate() {
    console.log("Negotiating ...");
    return pc
        .createOffer()
        .then(function(offer) {
            console.log("Setting local description ...");
            return pc.setLocalDescription(offer);
        })
        .then(function() {
            console.log("Waiting for ICE gathering to complete ...");
            return new Promise(function(resolve) {
                if (pc.iceGatheringState === "complete") {
                    resolve();
                } else {
                    function checkState() {
                        if (pc.iceGatheringState === "complete") {
                            pc.removeEventListener(
                                "icegatheringstatechange",
                                checkState
                            );
                            resolve();
                        }
                    }
                    pc.addEventListener("icegatheringstatechange", checkState);
                }
            });
        })
        .then(function() {
            console.log("Fetching offer ...");
            var offer = pc.localDescription;
            document.getElementById("offer-sdp").textContent = offer.sdp;
            return fetch("/offer", {
                body: JSON.stringify({
                    sdp: offer.sdp,
                    type: offer.type
                }),
                headers: {
                    "Content-Type": "application/json"
                },
                method: "POST"
            });
        })
        .then(function(response) {
            return response.json();
        })
        .then(function(answer) {
            document.getElementById("answer-sdp").textContent = answer.sdp;
            return pc.setRemoteDescription(answer);
        });
}

function start() {
    document.getElementById("start").style.display = "none";

    if (document.getElementById("use-datachannel").checked) {
        dc = pc.createDataChannel("chat");
        dc.onclose = function() {
            clearInterval(dcInterval);
            dataChannelLog.textContent += "- close\n";
        };
        dc.onopen = function() {
            dataChannelLog.textContent += "- open\n";
            dcInterval = setInterval(function() {
                var message = "ping";
                dataChannelLog.textContent += "> " + message + "\n";
                dc.send(message);
            }, 1000);
        };
        dc.onmessage = function(evt) {
            dataChannelLog.textContent += "< " + evt.data + "\n";
        };
    }

    constraints = { audio: false, video: false };

    /*
    navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
        console.log("Stream specification")
        console.log("typeof: ", typeof stream)
        console.log("content: ", stream)

        stream.getTracks().forEach(function(track) {
            console.log("Track specification")
            console.log("typeof: ", typeof track)
            console.log("content: ", track)

            pc.addTrack(track, stream);
        });
        return negotiate();
    });
    */

    /*
    const stream = new MediaStream();
    const track = new MediaStreamTrack();
    pc.addTrack(track, stream);
    */

    negotiate();

    document.getElementById("stop").style.display = "inline-block";
}

function stop() {
    document.getElementById("stop").style.display = "none";

    // close data channel
    if (dc) {
        dc.close();
    }

    // close audio / video
    pc.getSenders().forEach(function(sender) {
        sender.track.stop();
    });

    // close peer connection
    setTimeout(function() {
        pc.close();
    }, 500);
}
