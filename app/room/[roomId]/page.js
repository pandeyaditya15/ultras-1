"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useWebRTCAudio } from "@/utils/useWebRTCAudio";
import { useParams } from "next/navigation";
import { supabase } from "@/utils/supabase";
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';

export default function AudioRoom() {
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId || "default";
  // Use real user from Supabase
  const [currentUser, setCurrentUser] = useState(null);
  const userLoading = false;
  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState(null);
  // Stage state: host, guests, fans
  const [host, setHost] = useState({ name: "Host", avatar: "" });
  const [guests, setGuests] = useState([null, null]); // 2 guests
  const [fans, setFans] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  // Mute state: host, guests
  const [hostMuted, setHostMuted] = useState(false);
  const [guestMuted, setGuestMuted] = useState([true, true]);
  const [audienceUpdating, setAudienceUpdating] = useState(false);
  
  const chatContainerRef = useRef(null);

  // Generate avatar based on user ID
  const generateAvatar = (userId) => {
    const avatar = createAvatar(avataaars, {
      seed: userId,
      size: 128,
    });
    return avatar.toDataUri();
  };

  // Get user avatar from localStorage or generate new one
  const getUserAvatar = (userId) => {
    const storedProfile = localStorage.getItem(`profile_${userId}`);
    if (storedProfile) {
      const profile = JSON.parse(storedProfile);
      return profile.avatar_url;
    }
    return generateAvatar(userId);
  };

  // Fetch current user from Supabase and get username from profiles table
  useEffect(() => {
    async function fetchUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Fetch username from profiles table
        let username = session.user.user_metadata?.username || session.user.email;
        const { data: dbProfile, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', session.user.id)
          .single();
        if (dbProfile?.username) {
          username = dbProfile.username;
        }
        setCurrentUser({
          id: session.user.id,
          name: username,
          avatar: getUserAvatar(session.user.id)
        });
      }
    }
    fetchUser();
  }, []);

  // Fetch room data from Supabase and then fetch host's user profile for avatar
  useEffect(() => {
    async function fetchRoomAndHost() {
      setLoading(true);
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .single();
      if (data) {
        setRoom(data);
        // Fetch host's user profile for avatar
        let hostAvatar = null;
        let hostName = data.host_name || "Host";
        if (data.host_id) {
          const { data: hostProfile } = await supabase
            .from('profiles')
            .select('avatar_url, username')
            .eq('id', data.host_id)
            .single();
          hostAvatar = hostProfile?.avatar_url || generateAvatar(data.host_id);
          if (hostProfile?.username) hostName = hostProfile.username;
        }
        setHost({
          name: hostName,
          avatar: hostAvatar || generateAvatar(data.host_id || "host")
        });
      }
      setLoading(false);
    }
    if (roomId) fetchRoomAndHost();
  }, [roomId]);

  // Insert user into room_participants as audience if not already present
  useEffect(() => {
    async function joinAudience() {
      if (!currentUser?.id || !roomId) return;
      // Check if already present
      const { data: existing, error: fetchError } = await supabase
        .from('room_participants')
        .select('id')
        .eq('room_id', roomId)
        .eq('user_id', currentUser.id)
        .single();
      if (!existing) {
        await supabase.from('room_participants').insert({
          room_id: roomId,
          user_id: currentUser.id,
          role_in_room: 'audience',
        });
      }
    }
    joinAudience();
  }, [currentUser?.id, roomId]);

  // Real-time audience sync: listen for changes to room_participants and update fans array
  useEffect(() => {
    let isMounted = true;
    let audienceSub = null;
    
    async function fetchAudience() {
      // Get all audience user_ids
      const { data: audienceRows } = await supabase
        .from('room_participants')
        .select('user_id')
        .eq('room_id', roomId)
        .eq('role_in_room', 'audience');
      if (!isMounted) return;
      // Fetch all profiles in one query
      const userIds = audienceRows?.map(row => row.user_id) || [];
      if (userIds.length === 0) {
        setFans([]);
        return;
      }
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);
      // Map userId to profile
      const profileMap = {};
      if (profiles) {
        for (const p of profiles) {
          profileMap[p.id] = p;
        }
      }
      setFans(
        userIds.map(uid => ({
          name: profileMap[uid]?.username || 'Unknown',
          avatar: profileMap[uid]?.avatar_url || getUserAvatar(uid),
          id: uid,
        }))
      );
    }
    
    if (roomId) {
      fetchAudience();
      // Real-time subscription
      audienceSub = supabase
        .channel(`room_${roomId}_audience_sync`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_participants',
            filter: `room_id=eq.${roomId}`
          },
          async (payload) => {
            await fetchAudience();
          }
        )
        .subscribe();
    }
    
      return () => {
        isMounted = false;
      if (audienceSub) {
        audienceSub.unsubscribe();
      }
      };
  }, [roomId]);

  // Fetch messages from Supabase
  useEffect(() => {
    async function fetchMessages() {
      try {
        const { data, error } = await supabase
          .from('room_messages')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error fetching messages:', error);
          return;
        }

        if (data) {
          console.log('Fetched messages:', data);
          // Get all unique user IDs
          const userIds = [...new Set(data.map(msg => msg.user_id))];
          
          // Fetch usernames for all users
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', userIds);
          
          // Create a map of user ID to username
          const usernameMap = {};
          if (profiles) {
            profiles.forEach(profile => {
              usernameMap[profile.id] = profile.username;
            });
          }

          const formattedMessages = data.map(msg => ({
            id: msg.id,
            user: usernameMap[msg.user_id] || 'Unknown User',
            text: msg.message,
            timestamp: msg.created_at,
            userId: msg.user_id,
            avatar: getUserAvatar(msg.user_id)
          }));
          setMessages(formattedMessages);
        }
      } catch (err) {
        console.error('Exception fetching messages:', err);
      }
    }

    fetchMessages();

    // Set up real-time subscription for messages
    const messageSubscription = supabase
      .channel(`room_${roomId}_messages`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_messages',
          filter: `room_id=eq.${roomId}`
        },
        async (payload) => {
          console.log('New message received:', payload);
          try {
            // Fetch the new message
            const { data: newMessage, error } = await supabase
              .from('room_messages')
              .select('*')
              .eq('id', payload.new.id)
              .single();

            if (newMessage) {
              // Fetch username for the new message
              const { data: profile } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', newMessage.user_id)
                .single();

              const formattedMessage = {
                id: newMessage.id,
                user: profile?.username || 'Unknown User',
                text: newMessage.message,
                timestamp: newMessage.created_at,
                userId: newMessage.user_id,
                avatar: getUserAvatar(newMessage.user_id)
              };
              setMessages(prev => [...prev, formattedMessage]);
            }
          } catch (err) {
            console.error('Error processing new message:', err);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'room_messages',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          console.log('Message deleted:', payload);
          setMessages(prev => prev.filter(msg => msg.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      messageSubscription.unsubscribe();
    };
  }, [roomId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Cleanup when user leaves room
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (currentUser && roomId) {
        await supabase
          .from('room_participants')
          .delete()
          .eq('room_id', roomId)
          .eq('user_id', currentUser.id);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentUser, roomId]);

  // Real-time stage sync: listen for changes to room_participants and update guests array
  useEffect(() => {
    let isMounted = true;
    let stageSub = null;

    async function fetchStage() {
      if (!room || !room.host_id) return;
      const { data: stageRows } = await supabase
        .from('room_participants')
        .select('user_id')
        .eq('room_id', roomId)
        .eq('role_in_room', 'stage');
      if (!isMounted) return;
      // Exclude host from guests
      const userIds = (stageRows?.map(row => row.user_id) || []).filter(uid => uid !== room.host_id);
      if (userIds.length === 0) {
        setGuests([null, null]);
        return;
      }
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);
      const profileMap = {};
      if (profiles) {
        for (const p of profiles) {
          profileMap[p.id] = p;
        }
      }
      const guestList = userIds.slice(0, 2).map(uid => ({
        name: profileMap[uid]?.username || 'Unknown',
        avatar: profileMap[uid]?.avatar_url || getUserAvatar(uid),
        id: uid,
      }));
      while (guestList.length < 2) guestList.push(null);
      setGuests(guestList);
    }

    if (roomId && room && room.host_id) {
      fetchStage();
      stageSub = supabase
        .channel(`room_${roomId}_stage_sync`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_participants',
            filter: `room_id=eq.${roomId}`
          },
          async (payload) => {
            await fetchStage();
          }
        )
        .subscribe();
    }

    return () => {
      isMounted = false;
      if (stageSub) {
        stageSub.unsubscribe();
      }
    };
  }, [roomId, room?.host_id]);

  // Determine if current user is the host
  const isHost = currentUser && room && currentUser.id === room.host_id;

  // Determine if current user is on stage
  const isOnStage =
    (currentUser && host && (currentUser.name) === host.name) ||
    guests.some((g) => g && g.name === (currentUser?.name));

  // WebRTC audio hook
  const {
    myStream,
    peers,
    error: audioError,
    audioRefs,
    userId: myUserId,
    isMuted,
    toggleMute,
    isConnecting,
    audioLevels,
    roomUsers
  } = useWebRTCAudio({ roomId, isOnStage, currentUserId: currentUser?.id });

  if (loading) return <div>Loading...</div>;
  if (!room) return <div>Room not found</div>;

  // Host adds fan to stage
  function addFanToStage(fanIdx) {
    const emptyIdx = guests.findIndex((g) => !g);
    if (emptyIdx === -1) return;
    const newGuests = [...guests];
    newGuests[emptyIdx] = fans[fanIdx];
    setGuests(newGuests);
    setGuestMuted((m) => {
      const arr = [...m];
      arr[emptyIdx] = true;
      return arr;
    });
    setFans(fans.filter((_, i) => i !== fanIdx));
  }
  // Host removes guest from stage
  function removeGuest(idx) {
    if (!guests[idx]) return;
    setFans([...fans, guests[idx]]);
    const newGuests = [...guests];
    newGuests[idx] = null;
    setGuests(newGuests);
    setGuestMuted((m) => {
      const arr = [...m];
      arr[idx] = true;
      return arr;
    });
  }

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !currentUser?.id || sendingMessage) return;

    setSendingMessage(true);
    try {
      const { error } = await supabase
        .from('room_messages')
        .insert({
          room_id: roomId,
          user_id: currentUser.id,
          message: chatInput.trim()
        });

      if (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message');
      } else {
        setChatInput('');
      }
    } catch (err) {
      console.error('Exception sending message:', err);
      alert('Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const deleteMessage = async (messageId) => {
    try {
      const { error } = await supabase
        .from('room_messages')
        .delete()
        .eq('id', messageId)
        .eq('user_id', currentUser.id); // Only allow users to delete their own messages

      if (error) {
        console.error('Error deleting message:', error);
        alert('Failed to delete message');
      } else {
        // Immediately update local state
        setMessages(prev => prev.filter(msg => msg.id !== messageId));
      }
    } catch (err) {
      console.error('Exception deleting message:', err);
      alert('Failed to delete message');
    }
  };

  // Add user to stage (host action)
  async function addUserToStageFromMessage(userId, username, avatar) {
    // Update DB: set role_in_room to 'stage'
    await supabase
      .from('room_participants')
      .update({ role_in_room: 'stage' })
      .eq('room_id', roomId)
      .eq('user_id', userId);
  }

  // Remove user from stage (host action)
  async function removeUserFromStageFromMessage(userId) {
    // Update DB: set role_in_room to 'audience'
    await supabase
      .from('room_participants')
      .update({ role_in_room: 'audience' })
      .eq('room_id', roomId)
      .eq('user_id', userId);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1b2838] to-[#2a475e] p-8 text-[#c7d5e0]">
      {/* Hidden audio elements for WebRTC streams */}
      {peers.map(({ id, stream }) => (
        <audio
          key={id}
          ref={(el) => (audioRefs.current[id] = el)}
          autoPlay
          playsInline
          muted={false}
        />
      ))}

      <div className="grid grid-cols-3 gap-8 h-full">
        {/* Left Column */}
        <div className="col-span-2 flex flex-col gap-8">
          {/* On Stage */}
          <div className="flex flex-col items-center justify-center gap-6 w-full max-w-3xl mx-auto mt-2"
        style={{
              backgroundImage: `url(${room.stage_background_url || room.cover_photo_url || ''})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              borderRadius: '1.5rem',
              boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
              padding: '2rem',
        }}
      >
            {/* Host Card */}
            <div className="bg-[#232b38]/70 rounded-2xl shadow-lg flex flex-col items-center py-4 px-3 w-48 h-42 border border-[#33415c] relative">
              <img src={host.avatar || "/default-avatar.png"} alt={host.name} className="w-16 h-16 rounded-full border-4 border-[#66c0f4] object-cover mb-2" />
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xl font-bold text-white">{host.name} <span className="text-red-400">{room.host_name === "Harshit Tiwari" ? "❤️" : ""}</span></span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="bg-[#2ecc71] text-white text-xs font-bold px-3 py-1 rounded-full">Host</span>
          </div>
              
              {/* Audio Controls for Host */}
              {isHost && isOnStage && (
                <div className="absolute top-2 right-2 flex gap-2">
            <button
                    onClick={toggleMute}
                    className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors text-2xl ${
                      isMuted 
                        ? 'bg-red-500 hover:bg-red-600' 
                        : 'bg-green-500 hover:bg-green-600'
                    }`}
                    title={isMuted ? 'Unmute' : 'Mute'}
            >
                    {isMuted ? '🔇' : '🎤'}
            </button>
                  {isConnecting && (
                    <div className="p-2 bg-yellow-500 rounded-full animate-pulse">
                      🔄
                    </div>
          )}
        </div>
              )}
              
              {/* Audio Level Indicator (no digit shown, just bar) */}
              {isHost && isOnStage && audioLevels[currentUser?.id] > 0 && (
                <div className="absolute bottom-2 left-2 w-8 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-400 transition-all duration-100"
                    style={{ width: `${Math.min(audioLevels[currentUser?.id] / 2, 100)}%` }}
                  />
                </div>
              )}
            </div>
            
            {/* Guest/Stage Slots */}
            <div className="flex gap-10 w-full justify-center">
              {/* Guest Slot 1 */}
              <div className="bg-[#232b38]/70 rounded-2xl shadow flex flex-col items-center py-4 px-3 w-36 h-33 border border-[#33415c] relative">
                {guests[0] ? (
                  <>
                    <img src={guests[0].avatar || "/default-avatar.png"} alt={guests[0].name} className="w-12 h-12 rounded-full border-4 border-[#66c0f4] object-cover mb-2" />
                    <span className="text-white font-semibold text-base">{guests[0].name}</span>
                    <span className="bg-[#2ecc71] text-white text-xs font-bold px-3 py-1 rounded-full mt-1">LV.</span>
                    
                    {/* Audio Controls for Guest 1 */}
                    {guests[0].id === currentUser?.id && isOnStage && (
                      <div className="absolute top-2 right-2">
                        <button
                          onClick={toggleMute}
                          className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors text-xl ${
                            isMuted 
                              ? 'bg-red-500 hover:bg-red-600' 
                              : 'bg-green-500 hover:bg-green-600'
                          }`}
                          title={isMuted ? 'Unmute' : 'Mute'}
                        >
                          {isMuted ? '🔇' : '🎤'}
                        </button>
                      </div>
                    )}
                    
                    {/* Audio Level Indicator for Guest 1 */}
                    {guests[0].id === currentUser?.id && isOnStage && audioLevels[currentUser?.id] && (
                      <div className="absolute bottom-2 left-2 w-6 h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-400 transition-all duration-100"
                          style={{ width: `${Math.min(audioLevels[currentUser?.id] / 2, 100)}%` }}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="w-12 h-12 rounded-full bg-[#33415c]/70 flex items-center justify-center mb-2">
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#8f98a0" opacity="0.2"/><path d="M8 12h8M12 8v8" stroke="#8f98a0" strokeWidth="2" strokeLinecap="round"/></svg>
                    </div>
                    <span className="text-[#8f98a0] text-base font-semibold">Host will add you</span>
                  </div>
                )}
              </div>
              
              {/* Guest Slot 2 */}
              <div className="bg-[#232b38]/70 rounded-2xl shadow flex flex-col items-center py-4 px-3 w-36 h-33 border border-[#33415c] relative">
                {guests[1] ? (
                  <>
                    <img src={guests[1].avatar || "/default-avatar.png"} alt={guests[1].name} className="w-12 h-12 rounded-full border-4 border-[#66c0f4] object-cover mb-2" />
                    <span className="text-white font-semibold text-base">{guests[1].name}</span>
                    <span className="bg-[#2ecc71] text-white text-xs font-bold px-3 py-1 rounded-full mt-1">LV.</span>
                    
                    {/* Audio Controls for Guest 2 */}
                    {guests[1].id === currentUser?.id && isOnStage && (
                      <div className="absolute top-2 right-2">
                <button
                          onClick={toggleMute}
                          className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors text-xl ${
                            isMuted 
                              ? 'bg-red-500 hover:bg-red-600' 
                              : 'bg-green-500 hover:bg-green-600'
                          }`}
                          title={isMuted ? 'Unmute' : 'Mute'}
                >
                          {isMuted ? '🔇' : '🎤'}
                </button>
                      </div>
                    )}
                    
                    {/* Audio Level Indicator for Guest 2 */}
                    {guests[1].id === currentUser?.id && isOnStage && audioLevels[currentUser?.id] && (
                      <div className="absolute bottom-2 left-2 w-6 h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-400 transition-all duration-100"
                          style={{ width: `${Math.min(audioLevels[currentUser?.id] / 2, 100)}%` }}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="w-12 h-12 rounded-full bg-[#33415c]/70 flex items-center justify-center mb-2">
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#8f98a0" opacity="0.2"/><path d="M8 12h8M12 8v8" stroke="#8f98a0" strokeWidth="2" strokeLinecap="round"/></svg>
                    </div>
                    <span className="text-[#8f98a0] text-base font-semibold">Host will add you</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Stage Controls */}
            <div className="flex gap-4 mt-4">
              {/* Removed join/leave stage buttons - only host can add users via chat */}
            </div>
          </div>

          {/* Room Details */}
          <div className="bg-[#2a475e] p-4 rounded-xl flex justify-between items-center border border-gray-700">
            <div className="flex items-center gap-4">
              <img src={room.profile_pic_url || "/default-avatar.png"} alt="Room" className="w-16 h-16 rounded-lg object-cover"/>
              <div>
                <h1 className="text-xl font-bold text-white">{room.title}</h1>
                <p className="text-sm">{room.room_name}</p>
                <p className="text-xs text-[#8f98a0]">✨ Host: {host.name}</p>
              </div>
            </div>
                <button
              onClick={async () => {
                if (currentUser && roomId) {
                  await supabase
                    .from('room_participants')
                    .delete()
                    .eq('room_id', roomId)
                    .eq('user_id', currentUser.id);
                }
                router.push('/');
              }}
              className="px-4 py-2 bg-[#4f94bc] text-white rounded-lg hover:bg-[#66c0f4] transition-colors"
            >
              Leave
                </button>
        </div>

          {/* Audience */}
          <div className="bg-[#2a475e] p-6 rounded-xl border border-gray-700 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-bold text-white">👥 Audience ({fans.length})</h2>
              {audienceUpdating && (
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-green-400">Live</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-6">
              {fans.map((fan, idx) => (
                <div key={idx} className="flex flex-col items-center text-center">
                  <img src={fan.avatar} alt={fan.name} className="w-16 h-16 rounded-full"/>
                  <p className="text-sm text-white mt-2">{fan.name}</p>
            </div>
          ))}
            </div>
          </div>
        </div>

        {/* Right Column (Chat) */}
        <div className="col-span-1 bg-[#2a475e] rounded-xl flex flex-col border border-gray-700 mb-8">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-bold text-white">💬 Chat</h2>
      </div>
          <div 
            ref={chatContainerRef}
            className="h-[650px] p-4 overflow-y-auto hide-scrollbar"
          >
            {/* Messages */}
        <div className="flex flex-col gap-3">
              {messages.map((msg, idx) => {
                const isUserOnStage = guests.some(g => g && g.id === msg.userId);
                return (
                  <div key={msg.id || idx} className={`flex gap-2 ${msg.userId === currentUser?.id ? 'justify-end' : 'justify-start'}`}>
                    {msg.userId !== currentUser?.id && (
                      <img 
                        src={msg.avatar || "/default-avatar.png"} 
                        alt={msg.user} 
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    )}
                    <div className={`rounded-lg p-3 max-w-xs relative group ${msg.userId === currentUser?.id ? 'bg-[#4f94bc] text-white' : 'bg-[#1b2838] text-[#c7d5e0]'}`}>
                      {msg.userId !== currentUser?.id && (
                        <p className="text-xs font-bold text-[#66c0f4] mb-1">{msg.user}</p>
                      )}
                      {msg.userId === currentUser?.id && (
                        <p className="text-xs font-bold text-white mb-1">You</p>
                      )}
                      <p className="text-sm">{msg.text}</p>
                      {/* Delete button for user's own messages */}
                      {msg.userId === currentUser?.id && (
                        <button
                          onClick={() => deleteMessage(msg.id)}
                          className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete message"
                        >
                          ×
                        </button>
                      )}
                      {/* Add to Stage button for host on other users' messages */}
                      {isHost && msg.userId !== currentUser?.id && !isUserOnStage && (
                <button
                          onClick={() => addUserToStageFromMessage(msg.userId, msg.user, msg.avatar)}
                          className="absolute -top-2 -left-2 bg-green-500 hover:bg-green-600 text-white rounded-full px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          title="Add to Stage"
                        >
                          Add to Stage
                        </button>
              )}
                      {/* Remove from Stage button for host on other users' messages if user is on stage */}
                      {isHost && msg.userId !== currentUser?.id && isUserOnStage && (
                <button
                          onClick={() => removeUserFromStageFromMessage(msg.userId)}
                          className="absolute -top-2 -left-2 bg-red-500 hover:bg-red-600 text-white rounded-full px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          title="Remove from Stage"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-[#8f98a0]">No messages yet. Start the conversation!</p>
                </div>
              )}
            </div>
          </div>
          <div className="p-4 border-t border-gray-700">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                disabled={sendingMessage}
                className="flex-grow bg-[#1b2838] border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#66c0f4] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sendingMessage || !chatInput.trim()}
                className="px-6 py-2 bg-[#4f94bc] text-white rounded-lg hover:bg-[#66c0f4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingMessage ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
} 