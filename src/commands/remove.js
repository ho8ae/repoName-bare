const path = require('path');
const { box, section, msg, colors, icons, blank } = require('../ui/output');
const { selectWorktrees, confirm } = require('../ui/prompts');
const { withSpinner } = require('../ui/spinner');
const { getWorktreesExcludeBare, removeWorktree, getWorktreeBranch, isWorktreeDirty } = require('../services/worktree');
const { deleteBranch, getRemoteBranches, isMergedInto } = require('../services/branch');
const { fetchOrigin, isBareRepoExists } = require('../services/git');
const { findRootDir, loadConfig, getBareDir } = require('../utils/config-file');
const { isProtectedBranch } = require('../utils/validators');

/**
 * 워크트리별 삭제 후보 판정
 * - merged: base에 이미 반영됨 (일반/squash 머지) → 기본 체크
 * - gone:   원격 카운터파트 없음 (배지만, 자동 체크 안 함 — 미push 브랜치일 수 있음)
 * - dirty:  커밋 안 된 변경 있음 → 자동 체크 제외
 */
async function inspect(bareDir, rootDir, worktrees, baseBranch) {
  const remote = new Set(await getRemoteBranches(bareDir));

  return Promise.all(worktrees.map(async (wt) => {
    const protectedBranch = isProtectedBranch(wt.branch);
    const [merged, dirty] = await Promise.all([
      wt.branch && !protectedBranch
        ? isMergedInto(bareDir, wt.branch, `origin/${baseBranch}`)
        : false,
      isWorktreeDirty(path.join(rootDir, wt.name))
    ]);

    return {
      ...wt,
      protectedBranch,
      merged,
      dirty,
      gone: Boolean(wt.branch) && !protectedBranch && !remote.has(wt.branch),
      selected: merged && !dirty
    };
  }));
}

/**
 * 워크트리 삭제 명령어 (다중 선택, 로컬 브랜치 동시 삭제)
 */
async function remove() {
  const rootDir = findRootDir();
  const bareDir = getBareDir(rootDir);

  // bare repo 확인
  if (!isBareRepoExists(rootDir)) {
    msg.err("'.bare' 폴더가 없습니다");
    return;
  }

  box(`${icons.trash} 워크트리 삭제`);

  // 원격 저장소 동기화 (--prune 포함)
  await withSpinner('원격 저장소 동기화 중...', () => fetchOrigin(bareDir));

  // 워크트리 목록 조회
  const worktrees = await getWorktreesExcludeBare(bareDir);

  if (worktrees.length === 0) {
    msg.err('삭제할 워크트리가 없습니다');
    return;
  }

  // 삭제 후보 판정
  const baseBranch = loadConfig(rootDir).DEFAULT_BASE_BRANCH;
  const items = await withSpinner('삭제 후보 확인 중...', () =>
    inspect(bareDir, rootDir, worktrees, baseBranch)
  );

  const autoCount = items.filter(i => i.selected).length;
  if (autoCount > 0) {
    msg.info(`머지 완료 워크트리 ${autoCount}개를 자동 선택했습니다`);
  }

  // 워크트리 다중 선택
  section('워크트리 선택');
  const folders = await selectWorktrees(items);

  if (!folders || folders.length === 0) {
    msg.warn('취소됨');
    return;
  }

  // 선택한 워크트리별 브랜치 확인
  const targets = [];
  for (const folder of folders) {
    const branch = await getWorktreeBranch(path.join(rootDir, folder));
    targets.push({ folder, branch, withBranch: Boolean(branch) && !isProtectedBranch(branch) });
  }

  // 삭제 확인
  blank();
  console.log(`  ${colors.error(colors.bold(`정말 삭제할까요? (${targets.length}개)`))}`);
  targets.forEach(({ folder, branch, withBranch }) => {
    const dirty = items.find(i => i.name === folder)?.dirty;
    const branchLabel = !branch
      ? colors.dim('(브랜치 없음)')
      : withBranch
        ? `${icons.branch} ${branch} ${colors.dim('+ 로컬 브랜치 삭제')}`
        : `${icons.branch} ${branch} ${colors.warn('보호 브랜치 → 유지')}`;
    const dirtyLabel = dirty ? `  ${colors.error('⚠ 커밋 안 된 변경 있음')}` : '';
    console.log(`    ${icons.folder} ${folder}  ${branchLabel}${dirtyLabel}`);
  });

  blank();
  const proceed = await confirm(colors.error('삭제 진행?'), false);

  if (!proceed) {
    msg.warn('취소됨');
    return;
  }

  // 순차 삭제
  blank();
  let failed = 0;
  for (const { folder, branch, withBranch } of targets) {
    const result = await withSpinner(`${folder} 삭제 중...`, () => removeWorktree(bareDir, folder));

    if (!result.success) {
      msg.err(`${folder} 삭제 실패`);
      failed++;
      continue;
    }

    if (!withBranch) {
      msg.ok(`${folder} 삭제 완료`);
      continue;
    }

    const branchResult = await deleteBranch(bareDir, branch);
    if (branchResult.success) {
      msg.ok(`${folder} 삭제 완료 ${colors.dim(`(브랜치 ${branch} 삭제)`)}`);
    } else {
      msg.ok(`${folder} 삭제 완료 ${colors.warn(`(브랜치 ${branch} 삭제 실패)`)}`);
    }
  }

  blank();
  msg.info(`${targets.length - failed}/${targets.length} 처리 완료`);
}

module.exports = { remove, inspect };
