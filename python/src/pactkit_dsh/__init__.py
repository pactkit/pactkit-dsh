"""PactKit DSH — thin adapter for DeepSeek Harness."""

from pactkit import __version__  # noqa: F401

# Import for its side effect: the deployer module registers itself under the
# `dsh` name, and completing that registration is what makes
# `get_profile("dsh")` answer. Importing this package IS the availability
# signal — an uninstalled adapter cannot register, so `--format all` never
# deploys a host that is not there.
from pactkit_dsh.deployer import DshDeployer  # noqa: F401

__all__ = ["DshDeployer"]
