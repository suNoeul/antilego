# 배포·원격 실행 없이 Pages의 최소 권한과 버전 치환을 로컬에서 확인한다.
require 'yaml'
workflow = YAML.load_file(File.expand_path('../../../.github/workflows/pages.yml', __dir__))
build = workflow.fetch('jobs').fetch('build')
deploy = workflow.fetch('jobs').fetch('deploy')
verify = workflow.fetch('jobs').fetch('verify')
checks = [
  workflow['permissions'] == { 'contents' => 'read' },
  build['permissions'] == { 'contents' => 'read' },
  deploy['permissions'] == { 'contents' => 'read', 'pages' => 'write', 'id-token' => 'write' },
  build['steps'].any? { |step| step['with'] == { 'path' => 'web' } },
  build['steps'].any? { |step| step['run']&.include?(%q{sed -i "s/__V__/$V/g" web/index.html web/app.js}) },
  verify['permissions'] == { 'contents' => 'read' },
  verify['steps'].any? { |step| step['run'] == 'node spikes/11-reading-context/verify/run.mjs' },
  build['needs'] == 'verify',
  build['if'] == "github.event_name != 'pull_request'",
  deploy['needs'] == 'build',
  (workflow['on'] || workflow[true]).key?('pull_request'),
  build['steps'].any? { |step| step['run']&.include?('web/context-panel.js') }
]
abort "CI contract failed: #{checks.inspect}" unless checks.all?
puts "CI: YAML parse + #{checks.length} contracts PASS (permissions, web artifact, version stamp)"
