"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
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
  // Mute state: host, guests
  const [hostMuted, setHostMuted] = useState(false);
  const [guestMuted, setGuestMuted] = useState([true, true]);
  const [audienceUpdating, setAudienceUpdating] = useState(false);

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

  // Fetch room data from Supabase
  useEffect(() => {
    async function fetchRoom() {
      setLoading(true);
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .single();
      if (data) {
        setRoom(data);
        setHost({
          name: data.host_name || "Host Aditya",
          avatar: data.profile_pic_url || generateAvatar(data.host_id || "host")
        });
      }
      setLoading(false);
    }
    if (roomId) fetchRoom();
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
      // Also cleanup when component unmounts
      if (currentUser && roomId) {
        supabase
          .from('room_participants')
          .delete()
          .eq('room_id', roomId)
          .eq('user_id', currentUser.id);
      }
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

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      setMessages([...messages, { user: currentUser.name, text: chatInput }]);
      setChatInput("");
    }
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
            <div className="bg-[#232b38]/70 rounded-2xl shadow-lg flex flex-col items-center py-6 px-4 w-64 border border-[#33415c]">
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
              <div className="bg-[#232b38]/70 rounded-2xl shadow flex flex-col items-center py-6 px-4 w-48 border border-[#33415c]">
                {guests[0] ? (
                  <>
                    <img src={guests[0].avatar || "/default-avatar.png"} alt={guests[0].name} className="w-16 h-16 rounded-full object-cover mb-2" />
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
              <div className="bg-[#232b38]/70 rounded-2xl shadow flex flex-col items-center py-6 px-4 w-48 border border-[#33415c]">
                {guests[1] ? (
                  <>
                    <img src={guests[1].avatar || "/default-avatar.png"} alt={guests[1].name} className="w-16 h-16 rounded-full object-cover mb-2" />
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
          <div className="bg-[#2a475e] p-6 rounded-xl border border-gray-700">
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
        <div className="col-span-1 bg-[#2a475e] rounded-xl flex flex-col border border-gray-700">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-bold text-white">💬 Chat</h2>
          </div>
          <div className="flex-grow p-4 overflow-y-auto">
            {/* Messages */}
            <div className="flex flex-col gap-4">
              {messages.map((msg, idx) => (
                 <div key={idx} className={`flex gap-2 ${msg.user === currentUser.name ? 'justify-end' : ''}`}>
                   <div className={`rounded-lg p-3 max-w-xs ${msg.user === currentUser.name ? 'bg-[#4f94bc] text-white' : 'bg-[#1b2838]'}`}>
                     <p className="text-sm font-bold">{msg.user}</p>
                     <p className="text-sm">{msg.text}</p>
                   </div>
                 </div>
              ))}
               {messages.length === 0 && (
                <p className="text-center text-sm text-[#8f98a0]">No messages yet.</p>
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
                className="flex-grow bg-[#1b2838] border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
              />
              <button
                type="submit"
                className="px-6 py-2 bg-[#4f94bc] text-white rounded-lg hover:bg-[#66c0f4] transition-colors"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
} 