export const deepEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
export const safeStringify = (obj: any) => JSON.stringify(obj);
export const getTimeFrameInMs = (tf: string) => {
  if (tf.includes('second')) return parseInt(tf) * 1000;
  if (tf.includes('minute')) return parseInt(tf) * 60000;
  if (tf.includes('hour')) return parseInt(tf) * 3600000;
  if (tf.includes('day')) return parseInt(tf) * 86400000;
  return 5000;
};
export const cn = (...args: any[]) => args.filter(Boolean).join(' ');
