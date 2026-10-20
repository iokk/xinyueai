<template>
  <p class="site-filing">
    <span>{{ COMPANY }}</span>
    <span class="site-filing__sep">·</span>
    <span>{{ LOCATION }}</span>
    <span class="site-filing__sep">·</span>
    <a :href="ICP_URL" target="_blank" rel="noopener noreferrer">{{ ICP }}</a>
  </p>
</template>

<script setup lang="ts">
/**
 * 备案信息展示。
 *
 * 中国大陆法规要求：网站底部必须展示 ICP 备案号，且备案号应链接到
 * 工信部备案管理系统 https://beian.miit.gov.cn/ 。
 *
 * 这些是运营主体信息，不是上游产品品牌，因此独立成组件、不参与
 * scripts/apply-branding.mjs 的自动替换 —— 上游升级覆盖品牌时不会
 * 误改备案号。
 */
const COMPANY = '深圳市铂子科技有限责任公司'
const LOCATION = '中国深圳'
const ICP = '粤ICP备2026040043号-1'
const ICP_URL = 'https://beian.miit.gov.cn/'
</script>

<style scoped>
.site-filing {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--studio-muted, #8b8f9a);
}

.site-filing__sep {
  opacity: 0.5;
}

.site-filing a {
  color: inherit;
  text-decoration: none;
  transition: color 0.15s ease;
}

.site-filing a:hover {
  color: var(--studio-text, #fff);
  text-decoration: underline;
}
</style>
