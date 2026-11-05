import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('deploy',Path(__file__).parents[1]/'release-tools/deploy-remote.py')
deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
class PostTaskHealth(unittest.TestCase):
    def test_requires_two_independent_checks_one_minute_apart(self):
        operation={};health={'ok':True,'pid':42,'created':123,'at':'now'}
        self.assertFalse(deploy.observe_post_task(operation,health,1000))
        self.assertFalse(deploy.observe_post_task(operation,health,60999))
        self.assertTrue(deploy.observe_post_task(operation,health,61000))
    def test_exit_or_restart_never_qualifies_as_continuous_health(self):
        operation={};deploy.observe_post_task(operation,{'ok':True,'pid':42,'created':123,'at':'now'},0)
        with self.assertRaises(deploy.ssh.DeployError):deploy.observe_post_task(operation,{'ok':True,'pid':43,'created':124,'at':'later'},61000)
        with self.assertRaises(deploy.ssh.DeployError):deploy.observe_post_task({}, {'ok':False},0)
if __name__=='__main__':unittest.main()
