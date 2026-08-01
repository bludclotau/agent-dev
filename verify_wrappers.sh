#!/bin/bash

TOOLS_DIR="$HOME/agent-dev/tools"

echo "=== Verifying MicroVM Wrapper Rewrite ==="
echo "Checking directory: $TOOLS_DIR"
echo

# Helper function
check() {
    local description="$1"
    local command="$2"

    echo -n "[CHECK] $description ... "
    if eval "$command" >/dev/null 2>&1; then
        echo "OK"
    else
        echo "FAIL"
    fi
}

echo "== File Presence =="
check "microvm_session_create.js exists"  "[ -f $TOOLS_DIR/microvm_session_create.js ]"
check "microvm_session_exec.js exists"    "[ -f $TOOLS_DIR/microvm_session_exec.js ]"
check "microvm_file_write.js exists"      "[ -f $TOOLS_DIR/microvm_file_write.js ]"
check "microvm_file_read.js exists"       "[ -f $TOOLS_DIR/microvm_file_read.js ]"
check "microvm_session_destroy.js exists" "[ -f $TOOLS_DIR/microvm_session_destroy.js ]"
echo

echo "== Legacy Code Removal =="
check "No microvm-remote-run"   "! grep -R 'microvm-remote-run' -n $TOOLS_DIR"
check "No --destroy-session"    "! grep -R -- '--destroy-session' $TOOLS_DIR"
check "No --create-session"     "! grep -R -- '--create-session' $TOOLS_DIR"
check "No parseJsonOutput"      "! grep -R 'parseJsonOutput' -n $TOOLS_DIR"
check "No SESSION_ID_RE"        "! grep -R 'SESSION_ID_RE' -n $TOOLS_DIR"
check "No force flag"           "! grep -R 'force' $TOOLS_DIR/microvm_session_destroy.js"
echo

echo "== Correct New Flags =="
check "--session-create present"   "grep -R -- '--session-create'   $TOOLS_DIR/microvm_session_create.js"
check "--exec-session present"     "grep -R -- '--exec-session'     $TOOLS_DIR/microvm_session_exec.js"
check "--file-write present"       "grep -R -- '--file-write'       $TOOLS_DIR/microvm_file_write.js"
check "--file-read present"        "grep -R -- '--file-read'        $TOOLS_DIR/microvm_file_read.js"
check "--session-destroy present"  "grep -R -- '--session-destroy'  $TOOLS_DIR/microvm_session_destroy.js"
echo

echo "== Shared Import Correctness =="
check "Correct shared import" "grep -R \"require('./lib/shared.js')\" -n $TOOLS_DIR"
echo

echo "== Required Exports =="
check "SessionCreate exports"   "grep -R 'module.exports = microvmSessionCreate'   $TOOLS_DIR/microvm_session_create.js"
check "SessionExec exports"     "grep -R 'module.exports = microvmSessionExec'     $TOOLS_DIR/microvm_session_exec.js"
check "FileWrite exports"       "grep -R 'module.exports' $TOOLS_DIR/microvm_file_write.js"
check "FileRead exports"        "grep -R 'module.exports' $TOOLS_DIR/microvm_file_read.js"
check "SessionDestroy exports"  "grep -R 'module.exports = microvmSessionDestroy'  $TOOLS_DIR/microvm_session_destroy.js"
echo

echo "=== Verification Complete ==="
