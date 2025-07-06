"use client";
import { useState } from 'react';

export default function StageUsers({ 
  stageUsers, 
  audioLevels, 
  isHost, 
  onRemoveFromStage,
  currentUserId 
}) {
  const [hoveredUser, setHoveredUser] = useState(null);

  if (stageUsers.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#2a475e] rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Stage ({stageUsers.length})</h3>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#27ae60] rounded-full"></div>
          <span className="text-[#8f98a0] text-sm">Live Audio</span>
        </div>
      </div>
      
      <div className="space-y-3">
        {stageUsers.map((user) => {
          const audioLevel = audioLevels[user.userId] || 0;
          const audioLevelWidth = Math.min(100, Math.max(0, (audioLevel / 255) * 100));
          const isCurrentUser = user.userId === currentUserId;
          
          return (
            <div
              key={user.userId}
              className={`relative flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${
                isCurrentUser 
                  ? 'bg-[#1b2838] border border-[#66c0f4]' 
                  : 'bg-[#1b2838] hover:bg-[#171a21]'
              }`}
              onMouseEnter={() => setHoveredUser(user.userId)}
              onMouseLeave={() => setHoveredUser(null)}
            >
              {/* User Avatar */}
              <div className="relative">
                <img
                  src={user.userAvatar}
                  alt={user.username}
                  className="w-10 h-10 rounded-full object-cover border-2 border-[#2a475e]"
                />
                {/* Audio Level Indicator */}
                <div className="absolute -bottom-1 -right-1 w-4 h-4">
                  <div className="w-full h-full bg-[#2a475e] rounded-full flex items-center justify-center">
                    <div 
                      className="bg-[#66c0f4] rounded-full transition-all duration-100"
                      style={{ 
                        width: `${Math.max(20, audioLevelWidth)}%`, 
                        height: `${Math.max(20, audioLevelWidth)}%` 
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* User Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium truncate">
                    {user.username}
                  </span>
                  {isCurrentUser && (
                    <span className="text-[#66c0f4] text-xs font-medium">(You)</span>
                  )}
                  {isHost && (
                    <span className="text-[#f39c12] text-xs font-medium">Host</span>
                  )}
                </div>
                
                {/* Audio Level Bar */}
                <div className="mt-1">
                  <div className="w-full bg-[#2a475e] rounded-full h-1.5">
                    <div 
                      className="bg-[#66c0f4] h-1.5 rounded-full transition-all duration-100"
                      style={{ width: `${audioLevelWidth}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                {/* Mute Indicator */}
                <div className="w-2 h-2 bg-[#27ae60] rounded-full"></div>
                
                {/* Remove Button (Host Only) */}
                {isHost && !isCurrentUser && hoveredUser === user.userId && (
                  <button
                    onClick={() => onRemoveFromStage(user.userId)}
                    className="p-1 bg-[#e74c3c] text-white rounded-md hover:bg-[#c0392b] transition-colors"
                    title="Remove from stage"
                  >
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Audio Legend */}
      <div className="mt-4 pt-3 border-t border-gray-700">
        <div className="flex items-center justify-between text-xs text-[#8f98a0]">
          <span>Audio levels shown in real-time</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#27ae60] rounded-full"></div>
            <span>Active</span>
          </div>
        </div>
      </div>
    </div>
  );
} 