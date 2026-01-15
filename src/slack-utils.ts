export const isDirectMessage = (channelType?: string, channelId?: string): boolean => {
  if (channelType === "im") {
    return true;
  }
  if (channelId?.startsWith("D")) {
    return true;
  }
  return false;
};
