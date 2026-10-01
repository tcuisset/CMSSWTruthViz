FROM node:24-bookworm-slim AS frontend-dependencies

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY scripts/build-vendor.mjs scripts/build-vendor.mjs
RUN npm run vendor

FROM cmssw/el9:x86_64

WORKDIR /opt/app-root/src

COPY . /opt/app-root/src
COPY --from=frontend-dependencies /build/app/vendor /opt/app-root/src/app/vendor

RUN python3 -m venv venv \
    && venv/bin/python -m pip install --no-cache-dir -r requirements.txt \
    && chmod +x run.sh visualizeTruthGraph scripts/*.sh \
    && mkdir -p data \
    && printf 'window.EMBEDDED_BUNDLE_DATA = null;\n' > app/js/bundle.js \
    && printf 'window.EMBEDDED_RECHITS_DATA = null;\n' > app/js/rechits.js \
    && printf 'window.EMBEDDED_ASSOCIATION_DATA = null;\n' > app/js/associations.js \
    && chmod -R g=u /opt/app-root/src

ARG TRUTHVIZ_CMSSW_RELEASE=CMSSW_20_1_0_pre3
ARG TRUTHVIZ_SCRAM_ARCH=el9_amd64_gcc14

ENV TRUTHVIZ_PYTHON=python3 \
    TRUTHVIZ_SERVER_HOST=0.0.0.0 \
    TRUTHVIZ_SERVER_PORT=8080 \
    TRUTHVIZ_SERVER_AUTO_FIND_PORT=0 \
    VO_CMS_SW_DIR=/cvmfs/cms.cern.ch \
    CMSSET_DEFAULT=/cvmfs/cms.cern.ch/cmsset_default.sh \
    SITECONFIG_PATH=/cvmfs/cms.cern.ch/SITECONF/T2_CH_CERN/ \
    TRUTHVIZ_CMSSW_RELEASE=${TRUTHVIZ_CMSSW_RELEASE} \
    TRUTHVIZ_SCRAM_ARCH=${TRUTHVIZ_SCRAM_ARCH} \
    TRUTHVIZ_CMSSW_SRC=/cvmfs/cms.cern.ch/${TRUTHVIZ_SCRAM_ARCH}/cms/cmssw/${TRUTHVIZ_CMSSW_RELEASE}/src \
    TRUTHVIZ_JOB_TTL_SEC=86400 \
    TRUTHVIZ_CMSRUN_WRAPPER=

EXPOSE 8080

CMD ["/opt/app-root/src/scripts/run-production.sh"]
