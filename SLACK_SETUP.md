# Slack App Setup Guide

## Required Bot Token Scopes

Your bot needs the following permissions under **OAuth & Permissions → Bot Token Scopes**:

| Scope | Purpose |
|-------|---------|
| `app_mentions:read` | Respond to @mentions in channels |
| `channels:history` | Read messages in public channels |
| `channels:join` | Join channels (optional, for auto-joining) |
| `chat:write` | Send messages to channels and DMs |
| `im:history` | Read message history in direct messages |
| `im:read` | Read messages from direct message channels |
| `im:write` | Open and send direct messages |

## Required Event Subscriptions

In **Event Subscriptions → Subscribe to bot events**, enable:

- `app_mention` - Triggers when bot is @mentioned in a channel
- `message.channels` - Triggers on messages in public channels (for keyword detection)
- `message.im` - Triggers on direct messages

## Steps to Fix DM Responses

1. **Add Scopes**:
   - Go to https://api.slack.com/apps
   - Select your app
   - Navigate to **OAuth & Permissions → Bot Token Scopes**
   - Add all scopes listed above

2. **Enable Event Subscriptions**:
   - Navigate to **Event Subscriptions**
   - Turn ON "Enable Events"
   - Add the three events listed in the table above

3. **Reinstall the App**:
   - Scroll to the top of the OAuth & Permissions page
   - Click **Reinstall to Workspace** to get a new bot token with updated permissions

4. **Update Environment Variables**:
   - Copy the new **Bot User OAuth Token** (starts with `xoxb-`)
   - Update `SLACK_BOT_TOKEN` in your `.env` file

5. **Restart the Bot**:
   ```bash
   npm run dev -- slack
   ```

## Troubleshooting

### Bot doesn't respond to DMs
- Verify `im:read`, `im:history`, `chat:write` scopes are added
- Check that `message.im` is in event subscriptions
- Ensure the bot token was updated after adding scopes

### Bot doesn't respond to @mentions in channels
- Verify `app_mentions:read` scope is added
- Check that `app_mention` is in event subscriptions
- Ensure bot is invited to the channel

### Bot doesn't respond to keyword "agent" in channels
- Verify `channels:history` and `chat:write` scopes are added
- Check that `message.channels` is in event subscriptions

## Verification

After setup, test each interaction:

1. **Direct Message**: DM the bot directly with "hello"
2. **Channel Mention**: Type `@BotName draft a post about X` in a channel
3. **Keyword Trigger**: Type "agent, show me drafts" in a channel

All three should receive responses.
