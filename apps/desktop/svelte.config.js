import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
export default {
  compilerOptions: { experimental: { async: true } },
  kit: { adapter: adapter(), experimental: { remoteFunctions: true } }
};
