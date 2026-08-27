const execa = require('execa');

/**
 * 브랜치 목록 조회 (로컬 + 원격)
 * @param {string} bareDir - bare 저장소 경로
 * @returns {Promise<string[]>}
 */
async function getBranches(bareDir) {
  try {
    const { stdout } = await execa('git', ['-C', bareDir, 'branch', '-a']);

    const branches = stdout
      .split('\n')
      .map(line => line.replace(/^\*?\s*/, '').trim())
      .map(line => line.replace(/^remotes\/origin\//, ''))
      .filter(line => line && !line.includes('HEAD'))
      .filter((value, index, self) => self.indexOf(value) === index) // 중복 제거
      .sort();

    return branches;
  } catch {
    return [];
  }
}

/**
 * 로컬 브랜치 목록 조회
 * @param {string} bareDir - bare 저장소 경로
 * @returns {Promise<string[]>}
 */
async function getLocalBranches(bareDir) {
  try {
    const { stdout } = await execa('git', ['-C', bareDir, 'branch']);

    return stdout
      .split('\n')
      .map(line => line.replace(/^\*?\s*/, '').trim())
      .filter(line => line);
  } catch {
    return [];
  }
}

/**
 * 원격 브랜치 목록 조회
 * @param {string} bareDir - bare 저장소 경로
 * @returns {Promise<string[]>}
 */
async function getRemoteBranches(bareDir) {
  try {
    const { stdout } = await execa('git', ['-C', bareDir, 'branch', '-r']);

    return stdout
      .split('\n')
      .map(line => line.trim())
      .map(line => line.replace(/^origin\//, ''))
      .filter(line => line && !line.includes('HEAD'));
  } catch {
    return [];
  }
}

/**
 * 브랜치 존재 여부 확인
 * @param {string} bareDir - bare 저장소 경로
 * @param {string} branchName - 확인할 브랜치명
 * @returns {Promise<boolean>}
 */
async function branchExists(bareDir, branchName) {
  const branches = await getBranches(bareDir);
  return branches.includes(branchName);
}

/**
 * 브랜치 내용이 base에 이미 반영됐는지 확인 (일반 머지 + squash 머지)
 * @param {string} bareDir - bare 저장소 경로
 * @param {string} branch - 검사할 브랜치
 * @param {string} base - 기준 ref (예: origin/main)
 * @returns {Promise<boolean>}
 */
async function isMergedInto(bareDir, branch, base) {
  const git = (args) => execa('git', ['-C', bareDir, ...args]);

  try {
    // 일반 머지: 브랜치 tip이 base에서 도달 가능하면 고유 커밋이 0개
    const { stdout: ahead } = await git(['rev-list', '--count', `${base}..${branch}`]);
    if (ahead.trim() === '0') return true;

    // squash 머지: 브랜치 전체를 커밋 1개로 압축한 가짜 커밋을 만들어
    // 같은 패치가 base에 있는지 확인 (git cherry는 이미 반영된 커밋을 '-'로 표시)
    const { stdout: mergeBase } = await git(['merge-base', base, branch]);
    const { stdout: tree } = await git(['rev-parse', `${branch}^{tree}`]);
    const { stdout: squashed } = await git(['commit-tree', tree.trim(), '-p', mergeBase.trim(), '-m', '_']);
    const { stdout: cherry } = await git(['cherry', base, squashed.trim()]);

    return cherry.trim().startsWith('-');
  } catch {
    return false;
  }
}

/**
 * 브랜치 삭제
 * @param {string} bareDir - bare 저장소 경로
 * @param {string} branchName - 삭제할 브랜치명
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteBranch(bareDir, branchName) {
  try {
    await execa('git', ['-C', bareDir, 'branch', '-D', branchName]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.stderr || error.message };
  }
}

/**
 * PR 브랜치 fetch
 * @param {string} bareDir - bare 저장소 경로
 * @param {number} prNumber - PR 번호
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function fetchPRBranch(bareDir, prNumber) {
  try {
    await execa('git', ['-C', bareDir, 'fetch', 'origin', `pull/${prNumber}/head:pr-${prNumber}`]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.stderr || error.message };
  }
}

module.exports = {
  getBranches,
  getLocalBranches,
  getRemoteBranches,
  branchExists,
  isMergedInto,
  deleteBranch,
  fetchPRBranch
};
