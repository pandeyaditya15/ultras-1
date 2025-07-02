import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

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

// Main hook
export function useWebRTCAudio({ roomId, isOnStage, currentUserId }) {
  const [peers, setPeers] = useState([]); // [{ id, stream, username, avatar }]
  const [myStream, setMyStream] = useState(null);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const connections = useRef({}); // id -> RTCPeerConnection
  const [userId, setUserId] = useState(null);
  const audioRefs = useRef({}); // id -> audio element
  const [roomUsers, setRoomUsers] = useState([]); // userIds on stage
  const [audioLevels, setAudioLevels] = useState({}); // id -> audio level
  const [debugInfo, setDebugInfo] = useState({
    signalingSub: false,
    stageSub: false,
    connections: 0,
    lastSignal: null
  });

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
      console.log('Getting user media for stage participant');
      navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
        .then((stream) => {
          if (!stopped) {
            console.log('User media stream obtained');
            setMyStream(stream);
            // Set initial mute state
            stream.getAudioTracks().forEach(track => {
              track.enabled = !isMuted;
            });
          }
        })
        .catch((e) => {
          console.error('Error getting user media:', e);
          setError(e.message);
        });
    } else {
      console.log('Not on stage or window undefined, clearing stream');
      setMyStream(null);
    }
    return () => {
      stopped = true;
      setMyStream(null);
    };
  }, [isOnStage, isMuted]);

  // --- 2. Maintain user list in Supabase real-time ---
  useEffect(() => {
    if (!currentUserId || !roomId) {
      console.log('Missing currentUserId or roomId for stage presence');
      return;
    }

    console.log('Setting up stage presence for user:', currentUserId, 'in room:', roomId);

    // Join/leave stage in Supabase
    const updateStagePresence = async () => {
      try {
      if (isOnStage) {
          console.log('Adding user to stage participants');
        // Add to stage participants
          const { error } = await supabase
          .from('room_participants')
          .upsert({
            room_id: roomId,
            user_id: currentUserId,
            role_in_room: 'stage',
            joined_at: new Date().toISOString()
          }, { onConflict: 'room_id,user_id' });
            
          if (error) {
            console.error('Error adding user to stage:', error);
          } else {
            console.log('Successfully added user to stage');
          }
      } else {
          console.log('Removing user from stage participants');
        // Remove from stage participants
          const { error } = await supabase
          .from('room_participants')
          .delete()
          .eq('room_id', roomId)
          .eq('user_id', currentUserId)
          .eq('role_in_room', 'stage');
            
          if (error) {
            console.error('Error removing user from stage:', error);
          } else {
            console.log('Successfully removed user from stage');
          }
        }
      } catch (error) {
        console.error('Error updating stage presence:', error);
      }
    };

    updateStagePresence();

    // Listen for stage changes
    const stageSubscription = supabase
      .channel(`room_${roomId}_stage`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_participants',
          filter: `room_id=eq.${roomId}`
        },
        async (payload) => {
          console.log('Stage change detected in WebRTC hook:', payload);
          if (payload.new?.role_in_room === 'stage' || payload.old?.role_in_room === 'stage') {
            // Fetch current stage users
            const { data: stageUsers, error } = await supabase
              .from('room_participants')
              .select('user_id')
              .eq('room_id', roomId)
              .eq('role_in_room', 'stage');
            
            if (error) {
              console.error('Error fetching stage users:', error);
              return;
            }
            
            const userIds = stageUsers?.map(u => u.user_id) || [];
            console.log('Updated stage users:', userIds);
            setRoomUsers(userIds);
          }
        }
      )
      .subscribe((status) => {
        console.log('Stage subscription status in WebRTC:', status);
        setDebugInfo(prev => ({ ...prev, stageSub: status === 'SUBSCRIBED' }));
      });

    return () => {
      console.log('Cleaning up stage subscription');
      stageSubscription.unsubscribe();
    };
  }, [isOnStage, roomId, currentUserId]);

  // --- 3. Signaling via Supabase real-time ---
  useEffect(() => {
    if (!isOnStage || !currentUserId || !roomId) {
      console.log('Not setting up signaling - not on stage or missing data');
      return;
    }

    console.log('Setting up signaling channel for room:', roomId);
    const signalingChannel = supabase.channel(`room_${roomId}_signaling`);

    // Listen for signaling messages
    signalingChannel
      .on('broadcast', { event: 'webrtc-signal' }, async (payload) => {
        const { from, to, type, data } = payload.payload;
        console.log('Received signal:', { from, to, type, currentUserId });
        
        if (to !== currentUserId) return;

        let pc = connections.current[from];
        if (!pc) {
          console.log('Creating new peer connection for:', from);
          pc = createPeerConnection(from);
          connections.current[from] = pc;
        }

        try {
          if (type === "offer") {
            console.log('Processing offer from:', from);
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            // Send answer
            signalingChannel.send({
              type: 'broadcast',
              event: 'webrtc-signal',
              payload: {
                from: currentUserId,
                to: from,
                type: "answer",
                data: answer
              }
            });
            console.log('Sent answer to:', from);
          } else if (type === "answer") {
            console.log('Processing answer from:', from);
            await pc.setRemoteDescription(new RTCSessionDescription(data));
          } else if (type === "candidate") {
            console.log('Processing ICE candidate from:', from);
            await pc.addIceCandidate(new RTCIceCandidate(data));
          }
          
          setDebugInfo(prev => ({ ...prev, lastSignal: new Date().toISOString() }));
        } catch (error) {
          console.error('Error handling signal:', error);
        }
      })
      .subscribe((status) => {
        console.log('Signaling subscription status:', status);
        setDebugInfo(prev => ({ ...prev, signalingSub: status === 'SUBSCRIBED' }));
      });

    return () => {
      console.log('Cleaning up signaling channel');
      signalingChannel.unsubscribe();
    };
  }, [isOnStage, roomId, currentUserId]);

  // --- 4. Connect to other users on stage ---
  useEffect(() => {
    if (!isOnStage || !myStream || !currentUserId) {
      console.log('Not connecting to peers - missing requirements');
      return;
    }
    
    console.log('Connecting to peers on stage');
    setIsConnecting(true);
    
    // Connect to other users on stage
    const others = roomUsers.filter(id => id !== currentUserId);
    console.log('Other users on stage:', others);
    
    others.forEach(async (otherId) => {
      if (connections.current[otherId]) {
        console.log('Already connected to:', otherId);
        return; // already connected
      }
      
      console.log('Creating connection to:', otherId);
      const pc = createPeerConnection(otherId);
      connections.current[otherId] = pc;
      
      // Add tracks
      myStream.getTracks().forEach(track => pc.addTrack(track, myStream));
      
      // Create offer
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        // Send offer via Supabase
        const signalingChannel = supabase.channel(`room_${roomId}_signaling`);
        signalingChannel.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            from: currentUserId,
            to: otherId,
            type: "offer",
            data: offer
          }
        });
        console.log('Sent offer to:', otherId);
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    });

    // Remove connections to users no longer on stage
    Object.keys(connections.current).forEach((id) => {
      if (id === currentUserId) return;
      if (!others.includes(id)) {
        console.log('Removing connection to:', id);
        connections.current[id].close();
        delete connections.current[id];
        setPeers(prev => prev.filter(p => p.id !== id));
      }
    });

    setDebugInfo(prev => ({ ...prev, connections: Object.keys(connections.current).length }));
    setIsConnecting(false);
  }, [isOnStage, myStream, roomUsers, currentUserId, roomId]);

  // --- 5. Peer connection setup ---
  function createPeerConnection(peerId) {
    console.log('Creating peer connection for:', peerId);
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
      ],
    });

    // Send ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate to:', peerId);
        const signalingChannel = supabase.channel(`room_${roomId}_signaling`);
        signalingChannel.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            from: currentUserId,
            to: peerId,
            type: "candidate",
            data: event.candidate
          }
        });
      }
    };

    // Receive remote stream
    pc.ontrack = (event) => {
      console.log('Received remote stream from:', peerId);
      setPeers(prev => {
        if (prev.some(p => p.id === peerId)) return prev;
        return [...prev, { 
          id: peerId, 
          stream: event.streams[0],
          username: 'Unknown',
          avatar: null
        }];
      });
    };

    pc.onconnectionstatechange = () => {
      console.log('Connection state changed for:', peerId, 'State:', pc.connectionState);
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        console.log('Removing peer:', peerId);
        setPeers(prev => prev.filter(p => p.id !== peerId));
        pc.close();
        delete connections.current[peerId];
        setDebugInfo(prev => ({ ...prev, connections: Object.keys(connections.current).length }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state for:', peerId, 'State:', pc.iceConnectionState);
    };

    return pc;
  }

  // --- 6. Play remote streams ---
  useEffect(() => {
    peers.forEach(({ id, stream }) => {
      if (!audioRefs.current[id]) return;
      console.log('Setting audio source for peer:', id);
      audioRefs.current[id].srcObject = stream;
    });
  }, [peers]);

  // --- 7. Audio level monitoring ---
  useEffect(() => {
    if (!myStream) return;

    console.log('Setting up audio level monitoring');
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(myStream);
    microphone.connect(analyser);
    
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateAudioLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      setAudioLevels(prev => ({ ...prev, [currentUserId]: average }));
    };

    const interval = setInterval(updateAudioLevel, 100);
    return () => {
      clearInterval(interval);
      audioContext.close();
    };
  }, [myStream, currentUserId]);

  // --- 8. Mute/Unmute functionality ---
  const toggleMute = () => {
    if (myStream) {
      myStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
      console.log('Toggled mute state:', !isMuted);
    }
  };

  // --- 9. Cleanup on leave ---
  useEffect(() => {
    return () => {
      console.log('Cleaning up WebRTC connections');
      Object.values(connections.current).forEach(pc => pc.close());
      setPeers([]);
      
      // Remove from stage when component unmounts
      if (currentUserId && roomId) {
        supabase
          .from('room_participants')
          .delete()
          .eq('room_id', roomId)
          .eq('user_id', currentUserId)
          .eq('role_in_room', 'stage');
      }
    };
  }, [roomId, currentUserId]);

  // --- 10. Expose API ---
  return {
    myStream,
    peers,
    error,
    audioRefs,
    userId,
    isMuted,
    toggleMute,
    isConnecting,
    audioLevels,
    roomUsers,
    debugInfo
  };
} 