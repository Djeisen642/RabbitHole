import { context, reddit } from '@devvit/web/server';
import { postLink } from '../../shared/game/share';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: "r/abbitHole: today's puzzle",
  });
};

/** Create today's post and return its URL. */
export async function createPostUrl(): Promise<string> {
  const post = await createPost();
  return postLink(context.subredditName, post.id);
}
