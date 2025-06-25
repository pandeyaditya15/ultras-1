-- Create room_messages table for real-time chat (simplified version)
CREATE TABLE IF NOT EXISTS room_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_room_messages_room_id ON room_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_room_messages_created_at ON room_messages(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to read messages
CREATE POLICY "Allow authenticated users to read messages" ON room_messages
    FOR SELECT USING (auth.role() = 'authenticated');

-- Create policy to allow authenticated users to insert messages
CREATE POLICY "Allow authenticated users to insert messages" ON room_messages
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create policy to allow users to update their own messages
CREATE POLICY "Allow users to update their own messages" ON room_messages
    FOR UPDATE USING (auth.uid()::text = user_id);

-- Create policy to allow users to delete their own messages
CREATE POLICY "Allow users to delete their own messages" ON room_messages
    FOR DELETE USING (auth.uid()::text = user_id);

-- Enable real-time for the table
ALTER PUBLICATION supabase_realtime ADD TABLE room_messages;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can read messages from rooms they're in" ON room_messages;
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON room_messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON room_messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON room_messages;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_room_messages_updated_at 
    BEFORE UPDATE ON room_messages 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 