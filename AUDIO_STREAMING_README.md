# 🎤 Audio Streaming System

Banter now features a comprehensive real-time audio streaming system that allows hosts and guests to have live voice conversations in rooms.

## 🚀 Features

### Core Audio Features
- **Real-time Voice Streaming**: High-quality audio streaming between host and guests
- **WebRTC Technology**: Peer-to-peer connections for low-latency audio
- **Stage Management**: Host can add/remove users from the speaking stage
- **Mute/Unmute Controls**: Individual audio controls for each participant
- **Audio Level Monitoring**: Visual indicators showing audio activity
- **Echo Cancellation**: Built-in noise suppression and echo cancellation

### User Experience
- **Join/Leave Stage**: Users can request to join the stage or leave voluntarily
- **Visual Feedback**: Audio level indicators and connection status
- **Real-time Updates**: Live updates when users join/leave the stage
- **Responsive Design**: Works seamlessly across different devices

## 🏗️ Architecture

### Frontend Components
1. **Enhanced WebRTC Hook** (`utils/useWebRTCAudio.js`)
   - Manages WebRTC peer connections
   - Handles audio stream capture and playback
   - Provides mute/unmute functionality
   - Monitors audio levels

2. **Room Page** (`app/room/[roomId]/page.js`)
   - Displays stage participants
   - Shows audio controls and indicators
   - Manages stage membership
   - Integrates with chat system

### Backend Infrastructure
1. **Supabase Real-time Channels**
   - Signaling for WebRTC connections
   - Stage participant management
   - Real-time updates

2. **Database Schema**
   - `room_participants` table tracks user roles
   - `rooms` table stores room information
   - `profiles` table for user avatars and names

## 🎯 How It Works

### 1. Stage Management
- Users join rooms as "audience" by default
- Host can add users to "stage" role via chat or UI
- Users can request to join stage with "Join Stage" button
- Stage participants get audio streaming capabilities

### 2. Audio Streaming
- When a user is on stage, their microphone is activated
- WebRTC peer connections are established between all stage participants
- Audio streams are mixed and played back to all participants
- Audience members can hear but not speak

### 3. Real-time Signaling
- Supabase channels handle WebRTC signaling
- Offers, answers, and ICE candidates are exchanged
- Automatic reconnection when connections drop
- Cleanup when users leave the stage

## 🎮 Usage Guide

### For Hosts
1. **Create a Room**: Use the host dashboard to create a new room
2. **Start Streaming**: Join your room and you'll automatically be on stage
3. **Add Guests**: Click "Add to Stage" on chat messages or audience members
4. **Manage Audio**: Use the mute/unmute button to control your audio
5. **Monitor Levels**: Watch the audio level indicator for visual feedback

### For Guests
1. **Join a Room**: Enter a room code or click on a room
2. **Join Audience**: You'll automatically join as audience
3. **Request Stage**: Click "Join Stage" to request speaking privileges
4. **Control Audio**: Use mute/unmute controls when on stage
5. **Leave Stage**: Click "Leave Stage" to return to audience

### For Audience
1. **Listen**: You can hear all stage participants
2. **Chat**: Send messages in the chat
3. **Request Stage**: Ask to join the stage via chat or button

## 🔧 Technical Details

### WebRTC Configuration
```javascript
// Audio constraints for optimal quality
{
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
}
```

### ICE Servers
- Google STUN servers for NAT traversal
- Multiple fallback servers for reliability

### Signaling Protocol
- Uses Supabase real-time channels
- JSON messages for WebRTC signaling
- Automatic cleanup and reconnection

## 🛠️ Development

### Prerequisites
- Node.js 18+
- Supabase account
- Modern browser with WebRTC support

### Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Configure Supabase environment variables
4. Run the development server: `npm run dev`

### Key Files
- `utils/useWebRTCAudio.js` - WebRTC audio hook
- `app/room/[roomId]/page.js` - Room interface
- `audio-streaming-schema.sql` - Database schema
- `supabase-messages-table.sql` - Chat system schema

## 🐛 Troubleshooting

### Common Issues

**Audio not working:**
- Check browser permissions for microphone
- Ensure you're on stage (not just audience)
- Verify WebRTC is supported in your browser

**Connection issues:**
- Check internet connection
- Try refreshing the page
- Ensure Supabase is properly configured

**Mute not working:**
- Check if you're on stage
- Verify the mute button is visible
- Try toggling mute/unmute

### Debug Mode
Enable console logging to debug WebRTC connections:
```javascript
// Add to browser console
localStorage.setItem('debug-webrtc', 'true');
```

## 🔮 Future Enhancements

- **Video Support**: Add video streaming capabilities
- **Screen Sharing**: Allow participants to share their screen
- **Recording**: Record audio sessions
- **Advanced Audio**: Audio effects and filters
- **Mobile App**: Native mobile application
- **Analytics**: Track usage and performance metrics

## 📝 License

This audio streaming system is part of the Banter project and follows the same licensing terms.

---

For support or questions about the audio streaming system, please refer to the main project documentation or create an issue in the repository. 