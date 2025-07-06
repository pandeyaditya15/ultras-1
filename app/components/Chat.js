"use client";
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { supabase } from '../../utils/supabase';
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';

export default function Chat({ roomId, user, isHost, onAddToStage, onRemoveFromStage, stageUsers = [] }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Generate avatar for user
  const generateAvatar = (userId) => {
    const avatar = createAvatar(avataaars, {
      seed: userId,
      size: 128,
    });
    return avatar.toDataUri();
  };

  // Get user avatar
  const getUserAvatar = (userId) => {
    const storedProfile = localStorage.getItem(`profile_${userId}`);
    if (storedProfile) {
      const profile = JSON.parse(storedProfile);
      return profile.avatar_url;
    }
    return generateAvatar(userId);
  };

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io();
    setSocket(newSocket);

    // Join the room
    newSocket.emit('join_room', roomId);

    // Listen for new messages
    newSocket.on('new_message', (messageData) => {
      setMessages(prev => [...prev, messageData]);
    });

    // Listen for typing indicators
    newSocket.on('user_typing', (data) => {
      setTypingUsers(prev => {
        if (!prev.find(user => user.userId === data.userId)) {
          return [...prev, data];
        }
        return prev;
      });
    });

    newSocket.on('user_stopped_typing', (data) => {
      setTypingUsers(prev => prev.filter(user => user.userId !== data.userId));
    });

    // Listen for user joined
    newSocket.on('user_joined', (data) => {
      console.log('User joined:', data);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [roomId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket) return;

    const messageData = {
      roomId,
      message: newMessage.trim(),
      userId: user.id,
      username: user.name || user.user_metadata?.name || user.email,
      userAvatar: getUserAvatar(user.id)
    };

    socket.emit('send_message', messageData);
    setNewMessage('');
    
    // Clear typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    socket.emit('typing_stop', { roomId, userId: user.id });
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    
    if (!isTyping) {
      setIsTyping(true);
      socket?.emit('typing_start', {
        roomId,
        userId: user.id,
        username: user.name || user.user_metadata?.name || user.email
      });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket?.emit('typing_stop', { roomId, userId: user.id });
    }, 1000);
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar min-h-0">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-[#8f98a0]">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 ${message.userId === user.id ? 'justify-end' : 'justify-start'}`}
            >
              {message.userId !== user.id && (
                <img
                  src={message.userAvatar || getUserAvatar(message.userId)}
                  alt={message.username}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                />
              )}
              <div className={`rounded-lg p-3 max-w-xs relative group ${
                message.userId === user.id 
                  ? 'bg-[#4f94bc] text-white' 
                  : 'bg-[#1b2838] text-[#c7d5e0]'
              }`}>
                {message.userId !== user.id && (
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold text-[#66c0f4]">{message.username}</p>
                    {isHost && message.userId !== user.id && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onAddToStage(message.userId, message.username, message.userAvatar)}
                          className="text-xs bg-[#27ae60] text-white px-2 py-1 rounded hover:bg-[#229954] transition-colors font-medium"
                          title="Add to stage"
                        >
                          Add to Stage
                        </button>
                        <button
                          onClick={() => onRemoveFromStage(message.userId)}
                          className="text-xs bg-[#e74c3c] text-white px-2 py-1 rounded hover:bg-[#c0392b] transition-colors font-medium"
                          title="Remove from stage"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {message.userId === user.id && (
                  <p className="text-xs font-bold text-white mb-1">You</p>
                )}
                <p className="text-sm">{message.message}</p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Stage Users Info (Host Only) */}
      {isHost && stageUsers.length > 0 && (
        <div className="px-4 py-2 bg-[#1b2838] border-t border-gray-700">
          <div className="flex items-center gap-2 text-xs text-[#8f98a0]">
            <span>🎤 On Stage:</span>
            <div className="flex gap-1">
              {stageUsers.map((stageUser) => (
                <span key={stageUser.userId} className="text-[#66c0f4] font-medium">
                  {stageUser.username}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="p-4 border-t border-gray-700 bg-[#2a475e] sticky bottom-0">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={handleTyping}
            placeholder="Type a message..."
            className="flex-grow bg-[#1b2838] border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="px-6 py-2 bg-[#4f94bc] text-white rounded-lg hover:bg-[#66c0f4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
} 