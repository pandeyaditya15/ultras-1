-- Supabase Real-time Setup for Audio Room
-- This script ensures proper real-time functionality for the audio room

-- 1. Enable real-time for all required tables
ALTER PUBLICATION supabase_realtime ADD TABLE room_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE room_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;

-- 2. Create indexes for better real-time performance
CREATE INDEX IF NOT EXISTS idx_room_participants_room_role ON room_participants(room_id, role_in_room);
CREATE INDEX IF NOT EXISTS idx_room_messages_room_created ON room_messages(room_id, created_at);

-- 3. Ensure RLS policies allow real-time subscriptions
-- These policies should already exist, but let's make sure they're correct

-- Room participants policies for real-time
DROP POLICY IF EXISTS "Room participants are viewable by everyone" ON room_participants;
CREATE POLICY "Room participants are viewable by everyone" ON room_participants
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can join rooms" ON room_participants;
CREATE POLICY "Users can join rooms" ON room_participants
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own participation" ON room_participants;
CREATE POLICY "Users can update their own participation" ON room_participants
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave rooms" ON room_participants;
CREATE POLICY "Users can leave rooms" ON room_participants
    FOR DELETE USING (auth.uid() = user_id);

-- Room messages policies for real-time
DROP POLICY IF EXISTS "Room messages are viewable by everyone" ON room_messages;
CREATE POLICY "Room messages are viewable by everyone" ON room_messages
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can send messages" ON room_messages;
CREATE POLICY "Users can send messages" ON room_messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own messages" ON room_messages;
CREATE POLICY "Users can delete their own messages" ON room_messages
    FOR DELETE USING (auth.uid() = user_id);

-- 4. Create a function to get real-time room status
CREATE OR REPLACE FUNCTION get_room_status(room_uuid UUID)
RETURNS TABLE (
    room_id UUID,
    total_participants BIGINT,
    audience_count BIGINT,
    stage_count BIGINT,
    message_count BIGINT,
    last_activity TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id as room_id,
        COUNT(rp.id) as total_participants,
        COUNT(CASE WHEN rp.role_in_room = 'audience' THEN 1 END) as audience_count,
        COUNT(CASE WHEN rp.role_in_room = 'stage' THEN 1 END) as stage_count,
        COUNT(rm.id) as message_count,
        GREATEST(MAX(rp.joined_at), MAX(rm.created_at)) as last_activity
    FROM rooms r
    LEFT JOIN room_participants rp ON r.id = rp.room_id
    LEFT JOIN room_messages rm ON r.id = rm.room_id
    WHERE r.id = room_uuid
    GROUP BY r.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create a trigger to update room activity
CREATE OR REPLACE FUNCTION update_room_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the room's updated_at timestamp when participants or messages change
    UPDATE rooms 
    SET updated_at = NOW() 
    WHERE id = COALESCE(NEW.room_id, OLD.room_id);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for room activity updates
DROP TRIGGER IF EXISTS trigger_update_room_activity_participants ON room_participants;
CREATE TRIGGER trigger_update_room_activity_participants
    AFTER INSERT OR UPDATE OR DELETE ON room_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_room_activity();

DROP TRIGGER IF EXISTS trigger_update_room_activity_messages ON room_messages;
CREATE TRIGGER trigger_update_room_activity_messages
    AFTER INSERT OR UPDATE OR DELETE ON room_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_room_activity();

-- 6. Create a function to clean up stale participants
CREATE OR REPLACE FUNCTION cleanup_stale_participants()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Remove participants who haven't been active in the last 30 minutes
    DELETE FROM room_participants 
    WHERE joined_at < NOW() - INTERVAL '30 minutes';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create a scheduled job to clean up stale participants (if using pg_cron)
-- SELECT cron.schedule('cleanup-stale-participants', '*/5 * * * *', 'SELECT cleanup_stale_participants();');

-- 8. Add comments for documentation
COMMENT ON TABLE room_participants IS 'Real-time table for tracking users in audio rooms';
COMMENT ON TABLE room_messages IS 'Real-time table for chat messages in audio rooms';
COMMENT ON TABLE rooms IS 'Real-time table for room information';

COMMENT ON FUNCTION get_room_status(UUID) IS 'Get real-time status of a room including participant and message counts';
COMMENT ON FUNCTION cleanup_stale_participants() IS 'Clean up participants who have been inactive for 30+ minutes';

-- 9. Verify real-time setup
SELECT 
    schemaname,
    tablename,
    attname,
    atttypid::regtype as data_type
FROM pg_attribute a
JOIN pg_class c ON a.attrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
AND c.relname IN ('room_participants', 'room_messages', 'rooms')
AND a.attnum > 0
AND NOT a.attisdropped
ORDER BY c.relname, a.attnum;

-- 10. Check publication status
SELECT 
    schemaname,
    tablename,
    pubname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename IN ('room_participants', 'room_messages', 'rooms'); 