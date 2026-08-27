const execa = require('execa');
const path = require('path');
const fs = require('fs');
const { getRemoteBranches, isMergedInto } = require('./branch');
const { isProtectedBranch } = require('../utils/validators');

/**
 * 워크트리 목록 조회
 * @param {string} bareDir - bare 저장소 경로
 * @returns {Promise<Array<{path: string, name: string, branch: string, isBare: boolean}>>}
 */
async function getWorktrees(bareDir) {
  try {
    const { stdout } = await execa('git', ['-C', bareDir, 'worktree', 'list']);
    const lines = stdout.split('\n').filter(line => line.trim());

    return lines.map(line => {
      const parts = line.split(/\s+/);
      const wtPath = parts[0];
      const name = path.basename(wtPath);
      const isBare = line.includes('(bare)');

      // 브랜치명 추출
      let branch = '';
      const branchMatch = line.match(/\[([^\]]+)\]/);
      if (branchMatch) {
        branch = branchMatch[1];
      }

      return { path: wtPath, name, branch, isBare };
    });
  } catch (error) {
    return [];
  }
}

/**
 * 워크트리 목록 (bare 제외)
 * @param {string} bareDir - bare 저장소 경로
 * @returns {Promise<Array<{path: string, name: string, branch: string}>>}
 */
async function getWorktreesExcludeBare(bareDir) {
  const worktrees = await getWorktrees(bareDir);
  return worktrees.filter(wt => !wt.isBare);
}

/**
 * 새 브랜치와 함께 워크트리 생성
 * @param {string} bareDir - bare 저장소 경로
 * @param {string} folder - 생성할 폴더명
 * @param {string} newBranch - 새 브랜치명
 * @param {string} baseBranch - 기반 브랜치
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function createWorktreeWithNewBranch(bareDir, folder, newBranch, baseBranch) {
  const rootDir = path.dirname(bareDir);
  const worktreePath = path.join(rootDir, folder);

  try {
    await execa('git', ['-C', bareDir, 'worktree', 'add', '-b', newBranch, worktreePath, `origin/${baseBranch}`]);

    // upstream 해제 (base 브랜치에 실수로 push 방지)
    if (fs.existsSync(worktreePath)) {
      await execa('git', ['-C', worktreePath, 'branch', '--unset-upstream'], { reject: false });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.stderr || error.message };
  }
}

/**
 * 기존 브랜치로 워크트리 생성
 * @param {string} bareDir - bare 저장소 경로
 * @param {string} folder - 생성할 폴더명
 * @param {string} branch - 브랜치명
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function createWorktreeWithExistingBranch(bareDir, folder, branch) {
  const rootDir = path.dirname(bareDir);
  const worktreePath = path.join(rootDir, folder);

  try {
    // 먼저 로컬 브랜치로 시도, 실패하면 원격 브랜치에서 생성
    try {
      await execa('git', ['-C', bareDir, 'worktree', 'add', '-b', branch, worktreePath, `origin/${branch}`]);
    } catch {
      await execa('git', ['-C', bareDir, 'worktree', 'add', worktreePath, branch]);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.stderr || error.message };
  }
}

/**
 * 워크트리 삭제
 * @param {string} bareDir - bare 저장소 경로
 * @param {string} folder - 삭제할 폴더명
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function removeWorktree(bareDir, folder) {
  const rootDir = path.dirname(bareDir);
  const worktreePath = path.join(rootDir, folder);

  try {
    await execa('git', ['-C', bareDir, 'worktree', 'remove', worktreePath, '--force']);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.stderr || error.message };
  }
}

/**
 * 워크트리의 현재 브랜치 조회
 * @param {string} worktreePath - 워크트리 경로
 * @returns {Promise<string>}
 */
async function getWorktreeBranch(worktreePath) {
  try {
    const { stdout } = await execa('git', ['-C', worktreePath, 'branch', '--show-current']);
    return stdout.trim();
  } catch {
    return '';
  }
}

/**
 * 워크트리의 커밋 안 된 변경 개수
 * @param {string} worktreePath - 워크트리 경로
 * @returns {Promise<number>}
 */
async function getWorktreeChangeCount(worktreePath) {
  try {
    const { stdout } = await execa('git', ['-C', worktreePath, 'status', '--short'], { reject: false });
    return stdout.trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/**
 * 워크트리 상태 일괄 판정 (list / remove 공용)
 * - merged: base에 이미 반영됨 (일반/squash 머지)
 * - gone:   원격 카운터파트 없음 (미push 브랜치일 수도 있으므로 자동 선택은 안 함)
 * - changes/dirty: 커밋 안 된 변경
 * - selected: 삭제 화면 기본 체크 대상 (머지됐고 변경 없음)
 * @param {string} bareDir - bare 저장소 경로
 * @param {string} rootDir - 프로젝트 루트
 * @param {Array} worktrees - bare 제외 워크트리 목록
 * @param {string} baseBranch - 기준 브랜치명
 * @returns {Promise<Array>}
 */
async function inspectWorktrees(bareDir, rootDir, worktrees, baseBranch) {
  const remote = new Set(await getRemoteBranches(bareDir));

  return Promise.all(worktrees.map(async (wt) => {
    const protectedBranch = isProtectedBranch(wt.branch);

    const [merged, changes] = await Promise.all([
      wt.branch && !protectedBranch
        ? isMergedInto(bareDir, wt.branch, `origin/${baseBranch}`)
        : false,
      getWorktreeChangeCount(path.join(rootDir, wt.name))
    ]);

    return {
      ...wt,
      protectedBranch,
      merged,
      changes,
      dirty: changes > 0,
      gone: Boolean(wt.branch) && !protectedBranch && !remote.has(wt.branch),
      selected: merged && changes === 0
    };
  }));
}

module.exports = {
  getWorktrees,
  getWorktreesExcludeBare,
  createWorktreeWithNewBranch,
  createWorktreeWithExistingBranch,
  removeWorktree,
  getWorktreeBranch,
  getWorktreeChangeCount,
  inspectWorktrees
};
