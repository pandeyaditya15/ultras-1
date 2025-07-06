"use client";
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

export const useAudioStreaming = ({ roomId, currentUser, isHost, isOnStage }) => {
  const [socket, setSocket] = useState(null);
  const [peers, setPeers] = useState(new Map());
  const [myStream, setMyStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [audioLevels, setAudioLevels] = useState({});
  const [stageUsers, setStageUsers] = useState([]);
  
  const peerConnections = useRef(new Map());
  const localStream = useRef(null);
  const audioContext = useRef(null);
  const analyser = useRef(null);

  // Initialize Socket.IO connection
  useEffect(() => {
    if (!roomId || !currentUser) return;

    console.log('Initializing audio streaming for:', { roomId, currentUser: currentUser.id, isHost, isOnStage });

    const newSocket = io();
    setSocket(newSocket);

    // Join the room
    newSocket.emit('join_room', roomId);

    // Listen for WebRTC signaling
    newSocket.on('offer', handleOffer);
    newSocket.on('answer', handleAnswer);
    newSocket.on('ice-candidate', handleIceCandidate);

    // Listen for stage user changes
    newSocket.on('user_joined_stage', handleUserJoinedStage);
    newSocket.on('user_left_stage', handleUserLeftStage);

    return () => {
      newSocket.disconnect();
    };
  }, [roomId, currentUser]);

  // Handle incoming offer
  const handleOffer = async (data) => {
    if (data.to !== currentUser.id) return;

    try {
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      peerConnections.current.set(data.from, peerConnection);

      // Add local stream tracks
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => {
          peerConnection.addTrack(track, localStream.current);
        });
      }

      // Handle incoming stream
      peerConnection.ontrack = (event) => {
        const audioElement = document.createElement('audio');
        audioElement.srcObject = event.streams[0];
        audioElement.autoplay = true;
        audioElement.id = `audio-${data.from}`;
        document.body.appendChild(audioElement);
        
        setPeers(prev => new Map(prev.set(data.from, {
          stream: event.streams[0],
          audioElement
        })));
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', {
            roomId,
            candidate: event.candidate,
            from: currentUser.id,
            to: data.from
          });
        }
      };

      // Set remote description and create answer
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit('answer', {
        roomId,
        answer,
        from: currentUser.id,
        to: data.from
      });

    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  // Handle incoming answer
  const handleAnswer = async (data) => {
    if (data.to !== currentUser.id) return;

    const peerConnection = peerConnections.current.get(data.from);
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    }
  };

  // Handle ICE candidates
  const handleIceCandidate = (data) => {
    if (data.to !== currentUser.id) return;

    const peerConnection = peerConnections.current.get(data.from);
    if (peerConnection) {
      try {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
      }
    }
  };

  // Handle user joined stage
  const handleUserJoinedStage = (data) => {
    setStageUsers(prev => [...prev, data]);
    
    // If we're the host and someone joined the stage, create connection
    if (isHost && data.userId !== currentUser.id) {
      createConnectionToUser(data.userId);
    }
  };

  // Handle user left stage
  const handleUserLeftStage = (data) => {
    setStageUsers(prev => prev.filter(user => user.userId !== data.userId));
    
    // Close connection
    const peerConnection = peerConnections.current.get(data.userId);
    if (peerConnection) {
      peerConnection.close();
      peerConnections.current.delete(data.userId);
    }

    // Remove audio element
    const audioElement = document.getElementById(`audio-${data.userId}`);
    if (audioElement) {
      audioElement.remove();
    }

    setPeers(prev => {
      const newPeers = new Map(prev);
      newPeers.delete(data.userId);
      return newPeers;
    });
  };

  // Create connection to a specific user
  const createConnectionToUser = async (userId) => {
    if (!localStream.current) return;

    try {
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      peerConnections.current.set(userId, peerConnection);

      // Add local stream tracks
      localStream.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream.current);
      });

      // Handle incoming stream
      peerConnection.ontrack = (event) => {
        const audioElement = document.createElement('audio');
        audioElement.srcObject = event.streams[0];
        audioElement.autoplay = true;
        audioElement.id = `audio-${userId}`;
        document.body.appendChild(audioElement);
        
        setPeers(prev => new Map(prev.set(userId, {
          stream: event.streams[0],
          audioElement
        })));
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', {
            roomId,
            candidate: event.candidate,
            from: currentUser.id,
            to: userId
          });
        }
      };

      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit('offer', {
        roomId,
        offer,
        from: currentUser.id,
        to: userId
      });

    } catch (error) {
      console.error('Error creating connection:', error);
    }
  };

  // Start local stream
  const startStream = async () => {
    try {
      setIsConnecting(true);
      console.log('Requesting microphone access...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: false 
      });
      
      console.log('Microphone access granted');
      localStream.current = stream;
      setMyStream(stream);

      // Set up audio analysis for levels
      try {
        audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.current.createMediaStreamSource(stream);
        analyser.current = audioContext.current.createAnalyser();
        source.connect(analyser.current);

        // Start audio level monitoring
        startAudioLevelMonitoring();
        console.log('Audio analysis set up successfully');
      } catch (audioError) {
        console.warn('Audio analysis setup failed:', audioError);
        // Continue without audio analysis
      }

      // Notify others that we joined the stage
      if (socket) {
        socket.emit('user_joined_stage', {
          roomId,
          userId: currentUser.id,
          username: currentUser.name,
          userAvatar: currentUser.avatar
        });
        console.log('Emitted user_joined_stage event');
      }

      setIsConnecting(false);
      console.log('Stream started successfully');
    } catch (error) {
      console.error('Error starting stream:', error);
      setIsConnecting(false);
      
      // Show user-friendly error message
      if (error.name === 'NotAllowedError') {
        alert('Microphone access denied. Please allow microphone permissions and try again.');
      } else if (error.name === 'NotFoundError') {
        alert('No microphone found. Please connect a microphone and try again.');
      } else {
        alert('Failed to start audio stream. Please check your microphone and try again.');
      }
    }
  };

  // Stop local stream
  const stopStream = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
      setMyStream(null);
    }

    if (audioContext.current) {
      audioContext.current.close();
      audioContext.current = null;
    }

    // Close all peer connections
    peerConnections.current.forEach(connection => connection.close());
    peerConnections.current.clear();

    // Remove all audio elements
    peers.forEach(peer => {
      if (peer.audioElement) {
        peer.audioElement.remove();
      }
    });
    setPeers(new Map());

    // Notify others that we left the stage
    socket.emit('user_left_stage', {
      roomId,
      userId: currentUser.id
    });
  };

  // Toggle mute
  const toggleMute = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Monitor audio levels
  const startAudioLevelMonitoring = () => {
    if (!analyser.current) return;

    const dataArray = new Uint8Array(analyser.current.frequencyBinCount);
    
    const updateLevels = () => {
      if (!analyser.current) return;
      
      analyser.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      
      setAudioLevels(prev => ({
        ...prev,
        [currentUser.id]: average
      }));

      requestAnimationFrame(updateLevels);
    };

    updateLevels();
  };

  // Auto-start stream when joining stage
  useEffect(() => {
    console.log('Stage status changed:', { isOnStage, hasStream: !!myStream });
    if (isOnStage && !myStream) {
      console.log('Starting stream...');
      startStream();
    } else if (!isOnStage && myStream) {
      console.log('Stopping stream...');
      stopStream();
    }
  }, [isOnStage]);

  return {
    myStream,
    peers,
    isMuted,
    isConnecting,
    audioLevels,
    stageUsers,
    startStream,
    stopStream,
    toggleMute
  };
}; 