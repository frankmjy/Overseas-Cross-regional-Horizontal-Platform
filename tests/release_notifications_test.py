import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('deploy_remote',Path(__file__).parents[1]/'release-tools/deploy-remote.py')
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
class NotificationPolicyTests(unittest.TestCase):
    def test_explicit_suppression_does_not_generate_or_send_cards(self):
        with tempfile.TemporaryDirectory(prefix='admin-notify-policy-') as directory:
            with patch.object(deploy.subprocess,'run',side_effect=AssertionError('must not send')):
                for phase in ['start','success','error']:
                    result=deploy.notify(Path(directory),{'notificationPolicy':'none-by-user'},phase)
                    self.assertEqual(result,{'status':'suppressed','reason':'user-request'})
            self.assertEqual(list(Path(directory).iterdir()),[])
if __name__=='__main__':unittest.main()
