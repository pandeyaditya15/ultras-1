"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../utils/supabase";

export default function HostHome() {
  const [rooms, setRooms] = useState([]);
  const [activePage, setActivePage] = useState("home");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoom, setNewRoom] = useState({
    title: "",
    roomName: "",
    coverphoto: null,
    profilepic: null,
    stageBackground: null,
  });
  const [preview, setPreview] = useState({
    coverphoto: null,
    profilepic: null,
    stageBackground: null,
  });

  const [editingRoom, setEditingRoom] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editPreview, setEditPreview] = useState({ coverphoto: null, profilepic: null, stageBackground: null });
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log('Initial session:', session);
        if (!session) {
          setUser(null);
          setLoading(false);
          return;
        }
        if (session?.user) {
          setUser(session.user);
          console.log('User set:', session.user);
          if(session.user.user_metadata?.role === 'host') {
            fetchRooms(session.user.id);
          }
        }
      } catch (err) {
        // Handle AuthApiError: Invalid Refresh Token
        if (err?.message?.includes('Invalid Refresh Token')) {
          await supabase.auth.signOut();
          setUser(null);
          setLoading(false);
          return;
        }
      } finally {
        setLoading(false);
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        console.log('Auth state changed:', session);
        if (!session) {
          setUser(null);
          setLoading(false);
          return;
        }
        if (session?.user?.user_metadata?.role === 'host') {
          fetchRooms(session.user.id);
        } else {
          setRooms([]);
        }
      });

      return () => subscription.unsubscribe();
    };
    getSession();
  }, []);

  const fetchRooms = async (hostId) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('host_id', hostId);

    if (error) {
      console.error('Error fetching rooms:', error);
    } else {
      setRooms(data);
    }
    setLoading(false);
  };

  const uploadFile = async (file, bucket, base_path) => {
    if (!file) return null;

    const fileExt = file.name.split('.').pop();
    const path = `${base_path}.${fileExt}`;

    const { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) {
      throw error;
    }
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
    return publicUrl;
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoom.title || !newRoom.roomName || !user) {
      alert("Please enter both title and room name.");
      return;
    }
    setLoading(true);
    try {
      const coverUrl = await uploadFile(newRoom.coverphoto, 'rooms', `cover_${Date.now()}`);
      const picUrl = await uploadFile(newRoom.profilepic, 'rooms', `profile_${Date.now()}`);
      const bgUrl = await uploadFile(newRoom.stageBackground, 'rooms', `background_${Date.now()}`);
      
      const { data, error } = await supabase.from('rooms').insert({
        title: newRoom.title,
        room_name: newRoom.roomName,
      host_id: user.id,
        cover_photo_url: coverUrl,
        profile_pic_url: picUrl,
        stage_background_url: bgUrl,
      }).select();

      if (error) throw error;

      setRooms(prevRooms => [...prevRooms, data[0]]);
      setNewRoom({ title: "", roomName: "", coverphoto: null, profilepic: null, stageBackground: null });
      setPreview({ coverphoto: null, profilepic: null, stageBackground: null });
    setActivePage("myroom");
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRoom = async (e) => {
    e.preventDefault();
    if (!editingRoom || !user) return;
    setLoading(true);
    try {
      let updateData = {
        title: editingRoom.title,
        room_name: editingRoom.roomName,
      };

      if (editingRoom.coverphoto instanceof File) {
        updateData.cover_photo_url = await uploadFile(editingRoom.coverphoto, 'rooms', `cover_${editingRoom.id}_${Date.now()}`);
      }
      if (editingRoom.profilepic instanceof File) {
        updateData.profile_pic_url = await uploadFile(editingRoom.profilepic, 'rooms', `profile_${editingRoom.id}_${Date.now()}`);
      }
      if (editingRoom.stageBackground instanceof File) {
        updateData.stage_background_url = await uploadFile(editingRoom.stageBackground, 'rooms', `background_${editingRoom.id}_${Date.now()}`);
      }
      
      const { data, error } = await supabase
        .from('rooms')
        .update(updateData)
        .eq('id', editingRoom.id)
        .select();

      if (error) throw error;
      
      setRooms(rooms.map(r => r.id === editingRoom.id ? data[0] : r));
      setShowEditModal(false);
      setEditingRoom(null);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (window.confirm("Are you sure you want to delete this room?")) {
      setLoading(true);
      const { error } = await supabase.from('rooms').delete().eq('id', roomId);
      if (error) {
        alert(error.message);
      } else {
        setRooms(rooms.filter((room) => room.id !== roomId));
      }
      setLoading(false);
    }
  };

  const copyRoomLink = async (roomId) => {
    const roomLink = `${window.location.origin}/room/${roomId}`;
    try {
      await navigator.clipboard.writeText(roomLink);
      alert('Room link copied to clipboard!');
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = roomLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Room link copied to clipboard!');
    }
  };

  const handleFileChange = (e) => {
    const { name, files } = e.target;
    if (files[0]) {
      const file = files[0];
      setNewRoom({ ...newRoom, [name]: file });
      setPreview({ ...preview, [name]: URL.createObjectURL(file) });
    }
  };

  const handleEditFileChange = (e) => {
    const { name, value, files } = e.target;
    if (files && files[0]) {
      const file = files[0];
      setEditingRoom({ ...editingRoom, [name]: file });
      setEditPreview({ ...editPreview, [name]: URL.createObjectURL(file) });
    } else {
      setEditingRoom({ ...editingRoom, [name]: value });
    }
  };

  const handleAuthAction = async () => {
    setLoading(true);
    let error;
    if (isSignUp) {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: 'host',
          }
        }
      });
      error = signUpError;
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      error = signInError;
    }
    if (error) {
      alert(error.message);
    }
    setLoading(false);
  };

  const handleEditClick = (room) => {
    setEditingRoom(room);
    setEditPreview({
      coverphoto: room.cover_photo_url,
      profilepic: room.profile_pic_url,
      stageBackground: room.stage_background_url,
    });
    setShowEditModal(true);
  };

  const navItems = [
    { key: "home", label: "Home", icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#c7d5e0]"><path d="M4 12L12 4l8 8"/><path d="M4 12v8a2 2 0 0 0 2 2h3m6 0h3a2 2 0 0 0 2-2v-8"/><path d="M9 21V12h6v9"/></svg>
    ) },
    { key: "create", label: "Create Room", icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#c7d5e0]"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
    ) },
    { key: "myroom", label: "My Room", icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#c7d5e0]"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    ) },
  ];

  const startEditing = (room) => {
    setEditingRoom({ ...room });
    setEditPreview({
      coverphoto: room.cover_photo_url,
      profilepic: room.profile_pic_url,
      stageBackground: room.stage_background_url,
    });
    setShowEditModal(true);
  };

  const myRooms = rooms;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#1b2838] text-white">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#1b2838] to-[#2a475e]">
        <div className="w-full max-w-sm p-8 space-y-6 bg-[#2a475e] rounded-xl shadow-lg border border-gray-700">
          <h2 className="text-3xl font-bold text-center text-white">{isSignUp ? 'Host Sign Up' : 'Host Sign In'}</h2>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-600 bg-[#1b2838] text-white font-medium focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
          />
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-600 bg-[#1b2838] text-white font-medium focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
          />
          <button
            onClick={handleAuthAction}
            disabled={loading || !email || !password}
            className="w-full px-8 py-4 rounded-lg bg-[#66c0f4] text-white text-xl font-bold shadow-lg hover:bg-[#4f94bc] transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full text-center text-[#66c0f4] hover:underline"
          >
            {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
          </button>
        </div>
      </div>
    );
  }

  if (!loading && user && user.user_metadata?.role !== 'host') {
    const becomeHost = async () => {
      await supabase.auth.updateUser({ data: { role: 'host' } });
      window.location.reload();
    };
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1b2838] text-white flex-col gap-4">
        <div className="text-2xl font-bold">Access Denied</div>
        <div className="text-lg">You must be a host to access this page.</div>
        <button
          className="px-6 py-3 rounded-lg bg-[#66c0f4] text-white font-bold hover:bg-[#4f94bc] transition-colors"
          onClick={() => router.push('/')}
        >
          Go to Home
        </button>
        <button
          className="px-6 py-3 rounded-lg bg-[#4f94bc] text-white font-bold hover:bg-[#66c0f4] transition-colors"
          onClick={becomeHost}
        >
          Become a Host (for testing)
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-[#1b2838] to-[#2a475e] font-[Inter,Arial Rounded MT,system-ui,sans-serif] text-[#c7d5e0]">
      {/* Sidebar */}
      <aside className="w-72 min-h-screen p-6 flex flex-col justify-between bg-[#2a475e] border-r border-gray-700 shadow-sm">
        <div>
          {/* Sidebar nav */}
          <nav className="flex flex-col gap-1 mb-8">
            {navItems.map((item) => (
              <div
                key={item.key}
                className={`flex items-center gap-4 px-4 py-3 rounded-lg text-lg font-normal cursor-pointer hover:bg-[#1b2838] transition-colors select-none ${activePage === item.key ? 'bg-[#1b2838] font-semibold text-white' : 'text-[#c7d5e0]'}`}
                onClick={() => setActivePage(item.key)}
              >
                {item.icon}
                <span>{item.label}</span>
              </div>
            ))}
            {/* Ultras AI Button */}
            <div
              className={`flex items-center gap-4 px-4 py-3 rounded-lg text-lg font-normal cursor-pointer hover:bg-[#1b2838] transition-colors select-none ${activePage === 'ultras-ai' ? 'bg-[#1b2838] font-semibold text-white' : 'text-[#c7d5e0]'}`}
              onClick={() => {
                setActivePage('ultras-ai');
                router.push('/ultras-ai');
              }}
            >
              {/* Lightning bolt icon */}
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span>Ultras AI</span>
            </div>
          </nav>
        </div>
        {/* User Profile */}
        <div
          className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#1b2838] transition-colors cursor-pointer relative"
          onClick={() => router.push('/profile')}
        >
          {/* User Avatar */}
          <img
            src={user.user_metadata?.avatar_url || "/default-avatar.png"}
            alt={user.user_metadata?.name || user.email || "Host User"}
            className="w-10 h-10 rounded-full border-2 border-[#2a475e] object-cover"
          />
          <div className="flex flex-col">
            <span className="font-bold text-white leading-tight">{user.user_metadata?.name || "Host User"}</span>
            <span className="text-[#8f98a0] text-sm">{user.email}</span>
          </div>
        </div>
      </aside>
      {/* Main Content */}
      <main className="flex-1 w-full pt-4 sm:pt-6 px-4 sm:px-8 lg:px-16 min-h-screen">
        {activePage === "home" && (
          <>
            <div className="text-2xl mb-6 font-semibold text-white mt-0">Ultras</div>
            {rooms.length === 0 ? (
              <div className="text-[#8f98a0] text-center mt-20 font-semibold">No rooms created yet.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {rooms.map((room) => (
                  <div key={room.id} className="bg-[#2a475e] rounded-xl shadow-md overflow-hidden">
                    <div className="relative">
                        {room.cover_photo_url && typeof room.cover_photo_url === 'string' ? (
                        <img className="w-full h-48 object-cover" src={room.cover_photo_url} alt="Room cover" />
                      ) : (
                        <div className="w-full h-48 bg-[#171a21]"></div>
                      )}
                              </div>
                    <div className="p-4">
                      <div className="flex gap-4 items-center">
                        <div>
                          {room.profile_pic_url && typeof room.profile_pic_url === 'string' ? (
                            <img className="w-12 h-12 rounded-full object-cover" src={room.profile_pic_url} alt="Room profile" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-[#171a21] flex items-center justify-center">
                              <span className="text-white">?</span>
                          </div>
                          )}
                          </div>
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-white leading-tight">{room.title}</h3>
                          <p className="text-sm text-[#8f98a0]">{room.room_name}</p>
                        </div>
                      </div>
                        </div>
                    <div className="px-4 pb-4 flex justify-center">
                        <button
                        className="w-1/2 py-2 rounded-full bg-[#4f94bc] text-white text-base font-bold shadow hover:bg-[#66c0f4] transition-colors"
                          onClick={() => router.push(`/room/${room.id}`)}
                        >
                        Join Stream
                        </button>
                      </div>
                    </div>
                ))}
              </div>
            )}
          </>
        )}
        {activePage === "myroom" && (
          <>
            <div className="text-2xl mb-6 font-semibold text-white mt-0">My Rooms</div>
            {myRooms.length === 0 ? (
              <div className="text-[#8f98a0] text-center mt-20 font-semibold">No rooms created yet.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {myRooms.map((room) => (
                  <div key={room.id} className="bg-[#2a475e] rounded-xl shadow-md overflow-hidden">
                    <div className="relative">
                        {room.cover_photo_url && typeof room.cover_photo_url === 'string' ? (
                        <img className="w-full h-48 object-cover" src={room.cover_photo_url} alt="Room cover" />
                      ) : (
                        <div className="w-full h-48 bg-[#171a21]"></div>
                      )}
                              </div>
                    <div className="p-4">
                      <div className="flex gap-4 items-center">
                        <div>
                          {room.profile_pic_url && typeof room.profile_pic_url === 'string' ? (
                            <img className="w-12 h-12 rounded-full object-cover" src={room.profile_pic_url} alt="Room profile" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-[#171a21] flex items-center justify-center">
                              <span className="text-white">?</span>
                          </div>
                          )}
                          </div>
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-white leading-tight">{room.title}</h3>
                          <p className="text-sm text-[#8f98a0]">{room.room_name}</p>
                        </div>
                      </div>
                        </div>
                    <div className="px-4 pb-4 flex items-center justify-center gap-2">
                        <button
                        className="w-1/2 py-2 rounded-full bg-[#4f94bc] text-white text-base font-bold shadow hover:bg-[#66c0f4] transition-colors"
                          onClick={() => router.push(`/room/${room.id}`)}
                        >
                        Join Stream
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyRoomLink(room.id);
                        }}
                        className="p-2 rounded-full text-[#66c0f4] hover:bg-[#1b2838] transition-colors"
                        title="Share room link"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(room);
                        }}
                        className="p-2 rounded-full text-[#66c0f4] hover:bg-[#1b2838] transition-colors"
                        title="Edit room"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRoom(room.id);
                        }}
                        className="p-2 rounded-full text-red-400 hover:bg-[#1b2838] transition-colors"
                        title="Delete room"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        </button>
                      </div>
                    </div>
                ))}
              </div>
            )}
          </>
        )}
        {activePage === "create" && (
          <>
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <div className="text-2xl mb-8 font-semibold text-white">Create a Room</div>
              <form onSubmit={handleCreateRoom} className="flex flex-col gap-4 w-full max-w-md bg-[#2a475e] rounded-2xl p-6 shadow border border-gray-700">
                <div className="text-lg text-center text-white font-bold mb-2">Create a Room</div>
                {/* Cover Photo Upload */}
                <div>
                  <label className="block mb-1 text-[#c7d5e0] font-semibold">Cover Photo <span className="text-xs text-[#8f98a0]">(optional)</span></label>
                  <input
                    type="file"
                    name="coverphoto"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-[#8f98a0] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#4f94bc] file:text-white hover:file:bg-[#66c0f4]"
                  />
                  {preview.coverphoto && typeof preview.coverphoto === 'string' ? (
                    <img src={preview.coverphoto} alt="Cover Preview" className="mt-2 rounded-lg w-full h-32 object-cover border" />
                  ) : null}
                </div>

                {/* Room Profile Picture Upload */}
                <div>
                  <label className="block mb-1 text-[#c7d5e0] font-semibold">Room Profile Picture <span className="text-xs text-[#8f98a0]">(optional)</span></label>
                  <input
                    type="file"
                    name="profilepic"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-[#8f98a0] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#4f94bc] file:text-white hover:file:bg-[#66c0f4]"
                  />
                  {preview.profilepic && typeof preview.profilepic === 'string' ? (
                    <img src={preview.profilepic} alt="Profile Preview" className="mt-2 rounded-lg w-16 h-16 object-cover border" />
                  ) : null}
                </div>

                {/* Title */}
                <div>
                  <label className="block mb-1 text-[#c7d5e0] font-semibold">Title</label>
                  <input
                    className="w-full rounded-lg border border-gray-600 px-3 py-2 bg-[#1b2838] text-white font-medium"
                    type="text"
                    value={newRoom.title}
                    onChange={(e) => setNewRoom({ ...newRoom, title: e.target.value })}
                    placeholder="e.g. Arsenal vs Chelsea"
                    required
                  />
                </div>

                <div>
                  <label className="block mb-1 text-[#c7d5e0] font-semibold">Room Name</label>
                  <input
                    className="w-full rounded-lg border border-gray-600 px-3 py-2 bg-[#1b2838] text-white font-medium"
                    type="text"
                    value={newRoom.roomName}
                    onChange={(e) => setNewRoom({ ...newRoom, roomName: e.target.value })}
                    placeholder="e.g. Banter Room"
                    required
                  />
                </div>

                {/* Stage Background Input */}
                <div className="flex flex-col">
                  <label htmlFor="stageBackground" className="text-sm font-medium mb-1 text-white">Stage Background (Optional)</label>
                  <div className="w-full h-32 bg-[#171a21] border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-center p-2 relative">
                    {preview.stageBackground ? (
                      <img src={preview.stageBackground} alt="Stage Background Preview" className="h-full w-full object-contain rounded-md" />
                    ) : (
                      <p className="text-xs text-[#8f98a0]">Click to upload stage background</p>
                    )}
                    <input
                      type="file"
                      id="stageBackground"
                      name="stageBackground"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={handleFileChange}
                      accept="image/*"
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    className="flex-1 py-2 rounded-lg bg-[#8f98a0] text-white hover:bg-gray-500 transition-colors font-semibold"
                    onClick={() => setActivePage("home")}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-lg bg-[#4f94bc] text-white hover:bg-[#66c0f4] transition-colors font-bold"
                  >
                    Create & Start Room
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </main>
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-[#2a475e] rounded-2xl p-6 shadow-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-white">Edit Room</h2>
            <form onSubmit={handleUpdateRoom} className="flex flex-col gap-4">
              {/* Cover Photo Upload */}
              <div>
                <label className="block mb-1 text-[#c7d5e0] font-semibold">Cover Photo</label>
                {editPreview.coverphoto && (
                  <img src={editPreview.coverphoto} alt="Cover Preview" className="mb-2 rounded-lg w-full h-32 object-cover border" />
                )}
                <input
                  type="file"
                  name="coverphoto"
                  accept="image/*"
                  onChange={handleEditFileChange}
                  className="block w-full text-sm text-[#8f98a0] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#4f94bc] file:text-white hover:file:bg-[#66c0f4]" />
              </div>

              {/* Room Profile Picture Upload */}
              <div>
                <label className="block mb-1 text-[#c7d5e0] font-semibold">Room Profile Picture</label>
                {editPreview.profilepic && (
                  <img src={editPreview.profilepic} alt="Profile Preview" className="mb-2 rounded-lg w-16 h-16 object-cover border" />
                )}
                <input
                  type="file"
                  name="profilepic"
                  accept="image/*"
                  onChange={handleEditFileChange}
                  className="block w-full text-sm text-[#8f98a0] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#4f94bc] file:text-white hover:file:bg-[#66c0f4]" />
              </div>

              {/* Title */}
              <div className="flex flex-col">
                <label htmlFor="title" className="text-sm font-medium mb-1 text-white">Title</label>
                <input
                  id="title"
                  type="text"
                  name="title"
                  value={editingRoom?.title || ''}
                  onChange={(e) => setEditingRoom({...editingRoom, title: e.target.value})}
                  className="w-full rounded-lg border border-gray-600 px-3 py-2 bg-[#1b2838] text-white font-medium"
                  placeholder="e.g. Arsenal vs Chelsea"
                />
              </div>
              
              {/* Room Name */}
              <div className="flex flex-col">
                <label htmlFor="roomName" className="text-sm font-medium mb-1 text-white">Room Name</label>
                <input
                  id="roomName"
                  type="text"
                  name="roomName"
                  value={editingRoom?.room_name || ''}
                  onChange={(e) => setEditingRoom({...editingRoom, room_name: e.target.value})}
                  className="w-full rounded-lg border border-gray-600 px-3 py-2 bg-[#1b2838] text-white font-medium"
                  placeholder="e.g. Banter Room"
                />
              </div>

              {/* Stage Background Input */}
              <div className="flex flex-col">
                <label htmlFor="edit-stageBackground" className="text-sm font-medium mb-1 text-white">Stage Background (Optional)</label>
                <div className="w-full h-32 bg-[#171a21] border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-center p-2 relative">
                  {editPreview.stageBackground ? (
                    <img src={editPreview.stageBackground} alt="Stage Background Preview" className="h-full w-full object-contain rounded-md" />
                  ) : (
                    <p className="text-xs text-[#8f98a0]">Click to upload stage background</p>
                  )}
                  <input
                    type="file"
                    id="edit-stageBackground"
                    name="stageBackground"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={handleEditFileChange}
                    accept="image/*"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="flex-1 py-2 rounded-lg bg-[#8f98a0] text-white hover:bg-gray-500 transition-colors font-semibold"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-[#4f94bc] text-white hover:bg-[#66c0f4] transition-colors font-bold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
} 