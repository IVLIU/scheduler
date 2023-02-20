module.exports = {
  "github": {
    "release": true
  },
  "git": {
    "commitMessage": "release: v${version}"
  },
  "npm": {
    "publish": true
  },
  "hooks": {
    "after:bump": "echo 更新版本成功"
  },
  "plugins": {
    "@release-it/conventional-changelog": {
      "preset": "angular",
      "infile": "CHANGELOG.md"
    }
  }
}
