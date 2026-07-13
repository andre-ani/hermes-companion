import ai21 from '@lobehub/icons-static-svg/icons/ai21.svg?url';
import ai2 from '@lobehub/icons-static-svg/icons/ai2.svg?url';
import aionlabs from '@lobehub/icons-static-svg/icons/aionlabs.svg?url';
import alibaba from '@lobehub/icons-static-svg/icons/alibaba.svg?url';
import anthropic from '@lobehub/icons-static-svg/icons/anthropic.svg?url';
import azure from '@lobehub/icons-static-svg/icons/azureai.svg?url';
import arcee from '@lobehub/icons-static-svg/icons/arcee.svg?url';
import baidu from '@lobehub/icons-static-svg/icons/baidu.svg?url';
import bytedance from '@lobehub/icons-static-svg/icons/bytedance.svg?url';
import baseten from '@lobehub/icons-static-svg/icons/baseten.svg?url';
import bedrock from '@lobehub/icons-static-svg/icons/bedrock.svg?url';
import cerebras from '@lobehub/icons-static-svg/icons/cerebras.svg?url';
import cloudflare from '@lobehub/icons-static-svg/icons/cloudflare.svg?url';
import cohere from '@lobehub/icons-static-svg/icons/cohere.svg?url';
import deepinfra from '@lobehub/icons-static-svg/icons/deepinfra.svg?url';
import deepseek from '@lobehub/icons-static-svg/icons/deepseek.svg?url';
import fireworks from '@lobehub/icons-static-svg/icons/fireworks.svg?url';
import github from '@lobehub/icons-static-svg/icons/github.svg?url';
import google from '@lobehub/icons-static-svg/icons/google.svg?url';
import groq from '@lobehub/icons-static-svg/icons/groq.svg?url';
import huggingface from '@lobehub/icons-static-svg/icons/huggingface.svg?url';
import inception from '@lobehub/icons-static-svg/icons/inception.svg?url';
import inflection from '@lobehub/icons-static-svg/icons/inflection.svg?url';
import liquid from '@lobehub/icons-static-svg/icons/liquid.svg?url';
import lmstudio from '@lobehub/icons-static-svg/icons/lmstudio.svg?url';
import meta from '@lobehub/icons-static-svg/icons/meta.svg?url';
import minimax from '@lobehub/icons-static-svg/icons/minimax.svg?url';
import mistral from '@lobehub/icons-static-svg/icons/mistral.svg?url';
import microsoft from '@lobehub/icons-static-svg/icons/microsoft.svg?url';
import moonshot from '@lobehub/icons-static-svg/icons/moonshot.svg?url';
import nebius from '@lobehub/icons-static-svg/icons/nebius.svg?url';
import nous from '@lobehub/icons-static-svg/icons/nousresearch.svg?url';
import nvidia from '@lobehub/icons-static-svg/icons/nvidia.svg?url';
import novita from '@lobehub/icons-static-svg/icons/novita.svg?url';
import ollama from '@lobehub/icons-static-svg/icons/ollama.svg?url';
import openai from '@lobehub/icons-static-svg/icons/openai.svg?url';
import openrouter from '@lobehub/icons-static-svg/icons/openrouter.svg?url';
import perplexity from '@lobehub/icons-static-svg/icons/perplexity.svg?url';
import qwen from '@lobehub/icons-static-svg/icons/qwen.svg?url';
import sambanova from '@lobehub/icons-static-svg/icons/sambanova.svg?url';
import together from '@lobehub/icons-static-svg/icons/together.svg?url';
import upstage from '@lobehub/icons-static-svg/icons/upstage.svg?url';
import venice from '@lobehub/icons-static-svg/icons/venice.svg?url';
import vercel from '@lobehub/icons-static-svg/icons/vercel.svg?url';
import xai from '@lobehub/icons-static-svg/icons/xai.svg?url';
import zai from '@lobehub/icons-static-svg/icons/zai.svg?url';

const aliases: Record<string, string> = {
  'x-ai': 'xai', grok: 'xai', googleai: 'google', gemini: 'google', 'google-vertex': 'google', 'google-vertex-anthropic': 'anthropic',
  claude: 'anthropic', 'amazon-bedrock': 'bedrock', aws: 'bedrock', azureai: 'azure', 'azure-openai': 'azure',
  'github-copilot': 'github', 'github-models': 'github', llama: 'meta', 'meta-llama': 'meta', metaai: 'meta', 'mistralai': 'mistral', 'moonshotai-cn': 'moonshot', moonshotai: 'moonshot',
  alibabacloud: 'alibaba', 'alibaba-cn': 'alibaba', 'zhipuai': 'zai', 'zhipuai-coding-plan': 'zai', 'zai-coding-plan': 'zai',
  'z-ai': 'zai', 'fireworks-ai': 'fireworks', togetherai: 'together', 'cloudflare-workers-ai': 'cloudflare', 'nous-research': 'nous', nousresearch: 'nous',
  'allenai': 'ai2', 'aion-labs': 'aionlabs', 'arcee-ai': 'arcee', 'bytedance-seed': 'bytedance'
};

const icons: Record<string, string> = { ai2, ai21, aionlabs, alibaba, anthropic, arcee, azure, baidu, baseten, bedrock, bytedance, cerebras, cloudflare, cohere, deepinfra, deepseek, fireworks, github, google, groq, huggingface, inception, inflection, liquid, lmstudio, meta, microsoft, minimax, mistral, moonshot, nebius, nous, novita, nvidia, ollama, openai, openrouter, perplexity, qwen, sambanova, together, upstage, venice, vercel, xai, zai };

export function providerIcon(provider: string | null | undefined) {
  const normalized = provider?.trim().toLocaleLowerCase() ?? '';
  return icons[aliases[normalized] ?? normalized] ?? null;
}
