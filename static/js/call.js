"use strict";

const baseURL = "/";

let localVideo = document.querySelector("#localVideo");
let remoteVideo = document.querySelector("#remoteVideo");
let recipient;
let otherUser;
let remoteRTCMessage;

let iceCandidatesFromCaller = [];
let peerConnection;
let remoteStream;
let localStream;

let callInProgress = false;

//event from html
function call() {
  let userToCall = document.getElementById("callName").value;
  otherUser = userToCall;

  beReady().then((bool) => {
    processCall(userToCall);
  });
}

//event from html
function answer() {
  //do the event firing

  beReady().then((bool) => {
    processAccept();
  });

  document.getElementById("answer").style.display = "none";
}

let pcConfig = {
  iceServers: [
    { url: "stun:stun.l.google.com:19302" },
  ],
};

// Set up audio and video regardless of what devices are present.
let sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true,
};

// This below connectSocket() section will create a connection to the WebSocket (Django channels). 
// Then it listens to the events from the socket. based on the event type, it handles the UI and data.
let socket;
let callSocket;
function connectSocket(authToken, myName) {
  let ws_scheme = window.location.protocol == "https:" ? "wss://" : "ws://";
  console.log(ws_scheme);
  recipient = myName;
  // callSocket = new WebSocket(ws_scheme + window.location.host + "/ws/call/");

  // Pass the token as a query parameter
  // callSocket = new WebSocket(ws_scheme + window.location.host + "/ws/call/?token=" + token);

  // Append token as a query parameter in the WebSocket URL
  callSocket = new WebSocket(ws_scheme + window.location.host + "/ws/call/?token=" + authToken);

  callSocket.onopen = (event) => {
    //let's send myName to the socket
    callSocket.send(
      JSON.stringify({
        type: "login",
        data: {
          name: myName,
        },
      })
    );
  };

  callSocket.onmessage = (e) => {
    let response = JSON.parse(e.data);

    // console.log(response);

    let type = response.type;

    if (type == "connection") {
      console.log(response.data.message);
    }

    if (type == "call_received") {
      // console.log(response);
      onNewCall(response.data);
    }

    if (type == "call_answered") {
      onCallAnswered(response.data);
    }

    if (type == "ICEcandidate") {
      onICECandidate(response.data);
    }

    if (type === "user_list_update") {
      updateUserList(response.data);
      console.log('users list: ', response.data)
    }

    if (type === "sendMessage") {
      chatMsg(response.data);
      console.log('users msg: ', response.data)
    }
  };

  const onNewCall = (data) => {
    //when other called you
    //show answer button

    otherUser = data.caller;
    remoteRTCMessage = data.rtcMessage;

    // document.getElementById("profileImageA").src = baseURL + callerProfile.image;
    document.getElementById("callerName").innerHTML = otherUser;
    document.getElementById("call").style.display = "none";
    document.getElementById("answer").style.display = "block";
  };

  const onCallAnswered = (data) => {
    //when other accept our call
    remoteRTCMessage = data.rtcMessage;
    peerConnection.setRemoteDescription(
      new RTCSessionDescription(remoteRTCMessage)
    );

    document.getElementById("calling").style.display = "none";

    console.log("Call Started. They Answered");
    // console.log(pc);

    callProgress();
  };

  const onICECandidate = (data) => {
    // console.log(data);
    console.log("GOT ICE candidate");

    let message = data.rtcMessage;

    let candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate,
    });

    if (peerConnection) {
      console.log("ICE candidate Added");
      peerConnection.addIceCandidate(candidate);
    } else {
      console.log("ICE candidate Pushed");
      iceCandidatesFromCaller.push(candidate);
    }
  };

  // Function to update the user list in the UI
  function updateUserList(users) {
    const userListItems = document.getElementById("userListItems");
    userListItems.innerHTML = ""; // Clear existing list

    users.forEach(user => {
        const listItem = document.createElement("li");
        listItem.textContent = user;
        userListItems.appendChild(listItem);
    });
    document.getElementById("userList").style.display = "block";
  };

  // chat msg update 
  function chatMsg(data){
    var div = document.createElement("div");
    div.innerHTML = data.username + " : " + data.message;
    document.querySelector("#id_message_send_input").value = "";
    document.querySelector("#id_chat_item_container").appendChild(div);
  }

  // send msg from client to server
  document.querySelector("#id_message_send_input").focus();
  document.querySelector("#id_message_send_input").onkeyup = function (e) {
    if (e.keyCode == 13) {
      document.querySelector("#id_message_send_button").click();
    }
  };
  document.querySelector("#id_message_send_button").onclick = function (e) {
    var messageInput = document.querySelector(
      "#id_message_send_input"
    ).value;
    console.log('send msg to sender: ', otherUser);
    callSocket.send(
      JSON.stringify({
        type: "chat",
        data: {
          message: messageInput, 
          recipient : recipient,
          sendto: otherUser
        }
      })
    );
  };
}


// We need to send some events to the backend as well. we need to send "Call", "Answer" and "ICECandidates"
/**
 *
 * @param {Object} data
 * @param {number} data.name - the name of the user to call
 * @param {Object} data.rtcMessage - the rtc create offer object
 */
function sendCall(data) {
  //to send a call
  console.log("Send Call");

  // socket.emit("call", data);
  callSocket.send(
    JSON.stringify({
      type: "call",
      data,
    })
  );

  document.getElementById("call").style.display = "none";
  // document.getElementById("profileImageCA").src = baseURL + otherUserProfile.image;
  document.getElementById("otherUserNameCA").innerHTML = otherUser;
  document.getElementById("calling").style.display = "block";
}

/**
 *
 * @param {Object} data
 * @param {number} data.caller - the caller name
 * @param {Object} data.rtcMessage - answer rtc sessionDescription object
 */
function answerCall(data) {
  //to answer a call
  // socket.emit("answerCall", data);
  callSocket.send(
    JSON.stringify({
      type: "answer_call",
      data,
    })
  );
  callProgress();
}

/**
 *
 * @param {Object} data
 * @param {number} data.user - the other user //either callee or caller
 * @param {Object} data.rtcMessage - iceCandidate data
 */
function sendICEcandidate(data) {
  //send only if we have caller, else no need to
  console.log("Send ICE candidate");
  // socket.emit("ICEcandidate", data)
  callSocket.send(
    JSON.stringify({
      type: "ICEcandidate",
      data,
    })
  );
}

// The beReady() method will be called, whenever the user have to call or answer a call. 
// The processCall(), will be called to create an offer 
// and processAccept is called whenever a user get the call(the offer), and have to create an answer.
function beReady() {
  return navigator.mediaDevices
    .getUserMedia({
      audio: true,
      video: true,
    })
    .then((stream) => {
      localStream = stream;
      localVideo.srcObject = stream;

      return createConnectionAndAddStream();
    })
    .catch(function (e) {
      alert("getUserMedia() error: " + e.name);
    });
}

function createConnectionAndAddStream() {
  createPeerConnection();
  peerConnection.addStream(localStream);
  return true;
}

function processCall(userName) {
  peerConnection.createOffer(
    (sessionDescription) => {
      peerConnection.setLocalDescription(sessionDescription);
      sendCall({
        name: userName,
        rtcMessage: sessionDescription,
      });
    },
    (error) => {
      console.log("Error");
    }
  );
}

function processAccept() {
  console.log('remoteRTCMessage',remoteRTCMessage.sdp)
  // Modify the SDP if necessary (e.g., adjust codecs for compatibility)
  let sdp = remoteRTCMessage.sdp;

  // For example, Edge may need changes to certain codecs
  remoteRTCMessage.sdp = sdp.replace('UDP/TLS/RTP/SAVPF', 'RTP/SAVPF');

  // console.log('sdp changed: ', sdp);

  peerConnection.setRemoteDescription(
    new RTCSessionDescription(remoteRTCMessage)
  );
  peerConnection.createAnswer(
    (sessionDescription) => {
      peerConnection.setLocalDescription(sessionDescription);

      if (iceCandidatesFromCaller.length > 0) {
        //I am having issues with call not being processed in real world (internet, not local)
        //so I will push iceCandidates I received after the call arrived, push it and, once we accept
        //add it as ice candidate
        //if the offer rtc message contains all thes ICE candidates we can ingore this.
        for (let i = 0; i < iceCandidatesFromCaller.length; i++) {
          //
          let candidate = iceCandidatesFromCaller[i];
          console.log("ICE candidate Added From queue");
          try {
            peerConnection
              .addIceCandidate(candidate)
              .then((done) => {
                console.log(done);
              })
              .catch((error) => {
                console.log(error);
              });
          } catch (error) {
            console.log('error in processAccept',error);
          }
        }
        iceCandidatesFromCaller = [];
        console.log("ICE candidate queue cleared");
      } else {
        console.log("NO Ice candidate in queue");
      }

      answerCall({
        caller: otherUser,
        rtcMessage: sessionDescription,
      });
    },
    (error) => {
      console.log("Error");
    }
  );
}


function createPeerConnection() {
  try {
    peerConnection = new RTCPeerConnection(pcConfig);
    // peerConnection = new RTCPeerConnection();
    peerConnection.onicecandidate = handleIceCandidate;
    peerConnection.onaddstream = handleRemoteStreamAdded;
    peerConnection.onremovestream = handleRemoteStreamRemoved;
    console.log("Created RTCPeerConnnection");
    return;
  } catch (e) {
    console.log("Failed to create PeerConnection, exception: " + e.message);
    alert("Cannot create RTCPeerConnection object.");
    return;
  }
}

function handleIceCandidate(event) {
  // console.log('icecandidate event: ', event);
  if (event.candidate) {
    console.log("Local ICE candidate");
    // console.log(event.candidate.candidate);

    sendICEcandidate({
      user: otherUser,
      rtcMessage: {
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate,
      },
    });
  } else {
    console.log("End of candidates.");
  }
}

function handleRemoteStreamAdded(event) {
  console.log("Remote stream added.");
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
  console.log("Remote stream removed. Event: ", event);
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
}

window.onbeforeunload = function () {
  if (callInProgress) {
    stop();
  }
};

function stop() {
  localStream.getTracks().forEach((track) => track.stop());
  callInProgress = false;
  peerConnection.close();
  peerConnection = null;
  document.getElementById("call").style.display = "block";
  document.getElementById("answer").style.display = "none";
  document.getElementById("inCall").style.display = "none";
  document.getElementById("calling").style.display = "none";
  document.getElementById("videos").style.display = "none";
  otherUser = null;
}

function callProgress() {
  document.getElementById("videos").style.display = "block";
  document.getElementById("otherUserNameC").innerHTML = otherUser;
  document.getElementById("inCall").style.display = "block";

  callInProgress = true;
}
