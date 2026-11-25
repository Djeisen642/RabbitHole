import { context, reddit } from '@devvit/web/server';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: "r/abbitHole: today's puzzle",
  });
};

/** Create today's post and return its URL. */
export async function createPostUrl(): Promise<string> {
  const post = await createPost();
  return `https://reddit.com/r/${context.subredditName}/comments/${post.id}`;
}
