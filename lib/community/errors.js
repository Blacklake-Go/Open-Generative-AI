const FAILURES = {
  COMMUNITY_NOT_FOUND: [404, '作品不存在或尚未公开'],
  COMMUNITY_INPUT_INVALID: [400, '请检查标题、描述与标签长度'],
  COMMUNITY_ASSET_REQUIRED: [400, '请选择你拥有且已归档的作品'],
  COMMUNITY_ASSET_NOT_OWNED: [403, '作品不存在或不属于当前账户'],
  COMMUNITY_ASSET_NOT_ARCHIVED: [409, '原作品未完成归档或已不可用'],
  COMMUNITY_VERSION_REQUIRED: [409, '请刷新作品后再审核'],
  COMMUNITY_VERSION_CONFLICT: [409, '作品已变化或已撤回，请刷新后再操作'],
  COMMUNITY_REASON_REQUIRED: [400, '请填写有效的审核原因'],
  COMMUNITY_CAMPAIGN_INVALID: [400, '活动规则、时间或奖励配置无效'],
  COMMUNITY_CAMPAIGN_CLOSED: [409, '活动当前不接受此操作'],
  COMMUNITY_ALREADY_ENTERED: [409, '作品已经参加本次活动'],
  COMMUNITY_SELF_JUDGING: [403, '不能评审自己的投稿'],
  COMMUNITY_IDENTITY_REQUIRED: [409, '请先连接作品作者的主站账户'],
  COMMUNITY_MAIN_ASSET_UNAVAILABLE: [503, '主站作品暂时不可用，请稍后重试'],
  COMMUNITY_AWARD_LIMIT: [409, '活动获奖名额或奖励配置不允许此操作'],
  FORBIDDEN: [403, '没有社区管理权限'],
  UNAUTHORIZED: [401, '请先登录'],
};
export function publicCommunityFailure(error) {
  const code = String(error?.code || '');
  if (!Object.hasOwn(FAILURES, code)) return null;
  const [status, message] = FAILURES[code];
  return { status, message, code };
}
