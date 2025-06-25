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

  // Fetch audience from room_participants and get usernames from profiles table
  useEffect(() => {
    if (!roomId) return;

    async function fetchAudience() {
      // Get all audience user_ids
      const { data: audienceRows, error: audienceError } = await supabase
        .from('room_participants')
        .select('user_id')
        .eq('room_id', roomId)
        .eq('role_in_room', 'audience');
      if (!audienceRows || audienceRows.length === 0) {
        setFans([]);
        return;
      }
      // Fetch all profiles in one query
      const userIds = audienceRows.map(row => row.user_id);
      const { data: profiles, error: profilesError } = await supabase
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
    fetchAudience();

    // Set up real-time subscription (no filter property)
    const subscription = supabase
      .channel(`room_${roomId}_audience`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_participants',
        },
        async (payload) => {
          // Only refetch if the change is for this room and audience
          if (
            (payload.new && payload.new.room_id === roomId && payload.new.role_in_room === 'audience') ||
            (payload.old && payload.old.room_id === roomId && payload.old.role_in_room === 'audience')
          ) {
            setAudienceUpdating(true);
            await fetchAudience();
            setAudienceUpdating(false);
          }
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, [roomId]);

  // Fetch messages from Supabase
  useEffect(() => {
    if (!roomId) return;

    async function fetchMessages() {
      console.log('Fetching messages for room:', roomId);
      try {
        const { data, error } = await supabase
          .from('room_messages')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true })
          .limit(100);

        if (error) {
          console.error('Error fetching messages:', error);
          // If table doesn't exist, use local messages as fallback
          if (error.code === '42P01') { // Table doesn't exist
            console.log('room_messages table not found, using local messages');
            return;
          }
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
  } = useWebRTCAudio({ roomId, isOnStage });

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
  // Fan requests to join stage
  function joinStage() {
    const emptyIdx = guests.findIndex((g) => !g);
    if (emptyIdx === -1) return;
    const newGuests = [...guests];
    newGuests[emptyIdx] = {
      name: currentUser.name,
      avatar: currentUser.avatar
    };
    setGuests(newGuests);
    setGuestMuted((m) => {
      const arr = [...m];
      arr[emptyIdx] = true;
      return arr;
    });
    setFans(fans.filter((f) => f.name !== currentUser.name));
  }
  // Fan leaves stage
  function leaveStage() {
    const idx = guests.findIndex((g) => g && g.name === currentUser.name);
    if (idx === -1) return;
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
    if (!chatInput.trim() || !currentUser?.id || !roomId || sendingMessage) return;

    console.log('Sending message:', { roomId, userId: currentUser.id, message: chatInput.trim() });

    try {
      setSendingMessage(true);
      const { data, error } = await supabase
        .from('room_messages')
        .insert({
          room_id: roomId,
          user_id: currentUser.id,
          message: chatInput.trim()
        })
        .select();

      if (error) {
        console.error('Error sending message:', error);
        // If table doesn't exist, use local messages as fallback
        if (error.code === '42P01') {
          console.log('room_messages table not found, using local message fallback');
          const localMessage = {
            id: Date.now(),
            user: currentUser.name,
            text: chatInput.trim(),
            timestamp: new Date().toISOString(),
            userId: currentUser.id,
            avatar: currentUser.avatar
          };
          setMessages(prev => [...prev, localMessage]);
          setChatInput("");
          return;
        }
        alert('Failed to send message. Please try again.');
      } else {
        console.log('Message sent successfully:', data);
        setChatInput("");
      }
    } catch (error) {
      console.error('Exception sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  const deleteMessage = async (messageId) => {
    if (!currentUser?.id) {
      console.log('No current user found');
      return;
    }

    console.log('Attempting to delete message:', { messageId, userId: currentUser.id });

    try {
      // First, let's check if the message exists and belongs to the user
      const { data: messageCheck, error: checkError } = await supabase
        .from('room_messages')
        .select('id, user_id')
        .eq('id', messageId)
        .single();

      if (checkError) {
        console.error('Error checking message:', checkError);
        // If table doesn't exist, handle local message deletion
        if (checkError.code === '42P01') {
          console.log('room_messages table not found, handling local message deletion');
          setMessages(prev => prev.filter(msg => msg.id !== messageId));
          return;
        }
        alert('Message not found or you cannot delete this message.');
        return;
      }

      if (!messageCheck) {
        console.log('Message not found');
        alert('Message not found.');
        return;
      }

      console.log('Message found:', messageCheck);
      console.log('Comparing user IDs:', { messageUserId: messageCheck.user_id, currentUserId: currentUser.id });

      // Check if the message belongs to the current user
      if (messageCheck.user_id !== currentUser.id) {
        console.log('User ID mismatch - cannot delete this message');
        alert('You can only delete your own messages.');
        return;
      }

      // Now delete the message
      const { data, error } = await supabase
        .from('room_messages')
        .delete()
        .eq('id', messageId);

      if (error) {
        console.error('Error deleting message:', error);
        alert('Failed to delete message. Please try again.');
      } else {
        console.log('Message deleted successfully:', data);
        // Also remove from local state immediately for better UX
        setMessages(prev => prev.filter(msg => msg.id !== messageId));
      }
    } catch (error) {
      console.error('Exception deleting message:', error);
      alert('Failed to delete message. Please try again.');
    }
  };

  const addUserToStageFromMessage = (userId, username, avatar) => {
    // Only add if there is an empty guest slot and user is not already on stage
    if (!isHost) return;
    if (guests.some(g => g && g.id === userId)) return;
    const emptyIdx = guests.findIndex((g) => !g);
    if (emptyIdx === -1) return;
    const newGuests = [...guests];
    newGuests[emptyIdx] = {
      id: userId,
      name: username,
      avatar: avatar
    };
    setGuests(newGuests);
    setGuestMuted((m) => {
      const arr = [...m];
      arr[emptyIdx] = true;
      return arr;
    });
    setFans(fans.filter((f) => f.id !== userId));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1b2838] to-[#2a475e] p-8 text-[#c7d5e0]">
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
            <div className="bg-[#232b38]/70 rounded-2xl shadow-lg flex flex-col items-center py-6 px-4 w-58 h-47 border border-[#33415c]">
              <img src={host.avatar || "/default-avatar.png"} alt={host.name} className="w-20 h-20 rounded-full border-4 border-[#66c0f4] object-cover mb-2" />
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xl font-bold text-white">{host.name} <span className="text-red-400">{room.host_name === "Harshit Tiwari" ? "❤️" : ""}</span></span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="bg-[#2ecc71] text-white text-xs font-bold px-3 py-1 rounded-full">Host</span>
              </div>
            </div>
            {/* Guest/Stage Slots */}
            <div className="flex gap-6 w-full justify-center">
              {/* Guest Slot 1 */}
              <div className="bg-[#232b38]/70 rounded-2xl shadow flex flex-col items-center py-6 px-4 w-47 h-44 border border-[#33415c]">
                {guests[0] ? (
                  <>
                    <img src={guests[0].avatar || "/default-avatar.png"} alt={guests[0].name} className="w-16 h-16 rounded-full border-4 border-[#66c0f4] object-cover mb-2" />
                    <span className="text-white font-semibold text-base">{guests[0].name}</span>
                    <span className="bg-[#2ecc71] text-white text-xs font-bold px-3 py-1 rounded-full mt-1">LV.</span>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="w-16 h-16 rounded-full bg-[#33415c]/70 flex items-center justify-center mb-2">
                      <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#8f98a0" opacity="0.2"/><path d="M8 12h8M12 8v8" stroke="#8f98a0" strokeWidth="2" strokeLinecap="round"/></svg>
                    </div>
                    <span className="text-[#8f98a0] text-base font-semibold">Host will add you</span>
                  </div>
                )}
              </div>
              {/* Guest Slot 2 */}
              <div className="bg-[#232b38]/70 rounded-2xl shadow flex flex-col items-center py-6 px-4 w-47 h-44 border border-[#33415c]">
                {guests[1] ? (
                  <>
                    <img src={guests[1].avatar || "/default-avatar.png"} alt={guests[1].name} className="w-16 h-16 rounded-full border-4 border-[#66c0f4] object-cover mb-2" />
                    <span className="text-white font-semibold text-base">{guests[1].name}</span>
                    <span className="bg-[#2ecc71] text-white text-xs font-bold px-3 py-1 rounded-full mt-1">LV.</span>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="w-16 h-16 rounded-full bg-[#33415c]/70 flex items-center justify-center mb-2">
                      <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#8f98a0" opacity="0.2"/><path d="M8 12h8M12 8v8" stroke="#8f98a0" strokeWidth="2" strokeLinecap="round"/></svg>
                    </div>
                    <span className="text-[#8f98a0] text-base font-semibold">Host will add you</span>
                  </div>
                )}
              </div>
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
              {messages.map((msg, idx) => (
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
                    {isHost && msg.userId !== currentUser?.id && (
                <button
                        onClick={() => addUserToStageFromMessage(msg.userId, msg.user, msg.avatar)}
                        className="absolute -top-2 -left-2 bg-green-500 hover:bg-green-600 text-white rounded-full px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title="Add to Stage"
                >
                        Add to Stage
                </button>
              )}
                  </div>
            </div>
          ))}
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