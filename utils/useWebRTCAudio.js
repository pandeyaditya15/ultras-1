import { useEffect, useRef, useState } from "react";

// Utility: unique ID for each tab/user
function getUserId() {
  if (typeof window === "undefined") return null; // SSR guard
  let id = localStorage.getItem("banter-webrtc-userid");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem("banter-webrtc-userid", id);
  }
  return id;
}

// Utility: get room signaling key
function getRoomKey(roomId) {
  return `banter-webrtc-signaling-${roomId}`;
}

// Utility: get room user list key
function getRoomUsersKey(roomId) {
  return `banter-webrtc-users-${roomId}`;
}

// Main hook
export function useWebRTCAudio({ roomId, isOnStage }) {
  const [peers, setPeers] = useState([]); // [{ id, stream }]
  const [myStream, setMyStream] = useState(null);
  const [error, setError] = useState(null);
  const connections = useRef({}); // id -> RTCPeerConnection
  const [userId, setUserId] = useState(null);
  const audioRefs = useRef({}); // id -> audio element
  const [roomUsers, setRoomUsers] = useState([]); // userIds on stage

  // --- 0. Set userId on client only ---
  useEffect(() => {
    if (typeof window !== "undefined") {
      setUserId(getUserId());
    }
  }, []);

  // --- 1. Get mic stream if on stage ---
  useEffect(() => {
    let stopped = false;
    if (isOnStage && typeof window !== "undefined") {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          if (!stopped) setMyStream(stream);
        })
        .catch((e) => setError(e.message));
    } else {
      setMyStream(null);
    }
    return () => {
      stopped = true;
      setMyStream(null);
    };
  }, [isOnStage]);

  // --- 2. Maintain user list in localStorage ---
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const usersKey = getRoomUsersKey(roomId);
    let users = JSON.parse(localStorage.getItem(usersKey) || "[]");
    if (isOnStage && !users.includes(userId)) {
      users.push(userId);
      localStorage.setItem(usersKey, JSON.stringify(users));
    } else if (!isOnStage && users.includes(userId)) {
      users = users.filter((id) => id !== userId);
      localStorage.setItem(usersKey, JSON.stringify(users));
    }
    setRoomUsers(users);
    // Listen for changes
    function onStorage(e) {
      if (e.key === usersKey) {
        setRoomUsers(JSON.parse(e.newValue || "[]"));
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isOnStage, roomId, userId]);

  // --- 3. Signaling: listen for offers/answers/candidates ---
  useEffect(() => {
    if (!isOnStage || !userId || typeof window === "undefined") return;
    const roomKey = getRoomKey(roomId);
    async function handleSignal(msg) {
      if (msg.to !== userId) return;
      let pc = connections.current[msg.from];
      if (!pc) {
        pc = createPeerConnection(msg.from);
        connections.current[msg.from] = pc;
      }
      if (msg.type === "offer") {
        await pc.setRemoteDescription(new window.RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({
          type: "answer",
          from: userId,
          to: msg.from,
          sdp: answer,
        });
      } else if (msg.type === "answer") {
        await pc.setRemoteDescription(new window.RTCSessionDescription(msg.sdp));
      } else if (msg.type === "candidate") {
        try {
          await pc.addIceCandidate(new window.RTCIceCandidate(msg.candidate));
        } catch (e) {}
      }
    }
    function onStorage(e) {
      if (e.key !== roomKey) return;
      const messages = JSON.parse(localStorage.getItem(roomKey) || "[]");
      for (const msg of messages) {
        handleSignal(msg);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isOnStage, roomId, userId]);

  // --- 4. Connect to other users on stage ---
  useEffect(() => {
    if (!isOnStage || !myStream || !userId || typeof window === "undefined") return;
    // Only connect to up to 2 other users
    const others = roomUsers.filter((id) => id !== userId).slice(0, 2);
    others.forEach((otherId) => {
      if (connections.current[otherId]) return; // already connected
      const pc = createPeerConnection(otherId);
      connections.current[otherId] = pc;
      // Add tracks
      myStream.getTracks().forEach((track) => pc.addTrack(track, myStream));
      // Create offer
      pc.createOffer().then((offer) => {
        pc.setLocalDescription(offer);
        sendSignal({
          type: "offer",
          from: userId,
          to: otherId,
          sdp: offer,
        });
      });
    });
    // Remove connections to users no longer on stage
    Object.keys(connections.current).forEach((id) => {
      if (id === userId) return;
      if (!others.includes(id)) {
        connections.current[id].close();
        delete connections.current[id];
        setPeers((prev) => prev.filter((p) => p.id !== id));
      }
    });
    // eslint-disable-next-line
  }, [isOnStage, myStream, roomUsers, userId]);

  // --- 5. Peer connection setup ---
  function createPeerConnection(peerId) {
    const pc = new window.RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
      ],
    });
    // Send ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          type: "candidate",
          from: userId,
          to: peerId,
          candidate: event.candidate,
        });
      }
    };
    // Receive remote stream
    pc.ontrack = (event) => {
      setPeers((prev) => {
        // Only add if not already present
        if (prev.some((p) => p.id === peerId)) return prev;
        return [...prev, { id: peerId, stream: event.streams[0] }];
      });
    };
    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        setPeers((prev) => prev.filter((p) => p.id !== peerId));
        pc.close();
        delete connections.current[peerId];
      }
    };
    return pc;
  }

  // --- 6. Send signaling message via localStorage ---
  function sendSignal(msg) {
    if (typeof window === "undefined") return;
    const roomKey = getRoomKey(roomId);
    const messages = JSON.parse(localStorage.getItem(roomKey) || "[]");
    messages.push(msg);
    localStorage.setItem(roomKey, JSON.stringify(messages));
    // Trigger storage event for same tab
    window.dispatchEvent(new window.StorageEvent("storage", { key: roomKey }));
  }

  // --- 7. Play remote streams ---
  useEffect(() => {
    peers.forEach(({ id, stream }) => {
      if (!audioRefs.current[id]) return;
      audioRefs.current[id].srcObject = stream;
    });
  }, [peers]);

  // --- 8. Cleanup on leave ---
  useEffect(() => {
    return () => {
      Object.values(connections.current).forEach((pc) => pc.close());
      setPeers([]);
      // Remove self from user list
      if (typeof window !== "undefined" && userId) {
        const usersKey = getRoomUsersKey(roomId);
        let users = JSON.parse(localStorage.getItem(usersKey) || "[]");
        users = users.filter((id) => id !== userId);
        localStorage.setItem(usersKey, JSON.stringify(users));
      }
    };
  }, [roomId, userId]);

  // --- 9. Expose API ---
  return {
    myStream,
    peers,
    error,
    audioRefs,
    userId,
  };
} 