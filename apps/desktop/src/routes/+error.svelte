<script lang="ts">
  import { page } from '$app/state';
  import AppError from '$lib/components/companion/app-error.svelte';
</script>

<AppError status={page.status} />
